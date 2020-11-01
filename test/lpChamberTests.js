const LPChamber = artifacts.require("LPChamber");

const QuadAdminMock = artifacts.require("QuadAdminMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const MockGovernor = artifacts.require("MockGovernor");
const MockVault = artifacts.require("QuadVaultMock");

const truffleAssert = require("truffle-assertions");

const chai = require("chai");
chai.use(require("chai-bn")(require("bn.js")));

const { expect, assert } = chai; 


contract("LPChamber", addresses => {

    let owner = addresses[0];
    let submitter = addresses[1];
    let random = addresses[2];

    beforeEach(async () => {
        this.quadAdmin = await QuadAdminMock.new({ from: owner });

        let quadChamberRole = web3.utils.soliditySha3("QUAD_CHAMBER_ROLE");
        await this.quadAdmin.registerSingleton(quadChamberRole, submitter);

        this.lpChamber = await LPChamber.new(500, 5100, 60 * 60 * 48, this.quadAdmin.address, { from: owner });
        
        this.lpToken1 = await ERC20Mock.new(10e18.toString(), { from: owner });
        await this.lpToken1.transfer(submitter, 5e18.toString(), { from: owner });

        this.lpToken2 = await ERC20Mock.new(100e18.toLocaleString("fullwide", { useGrouping: false }), { from: owner });
        await this.lpToken2.transfer(submitter, 50e18.toLocaleString("fullwide", { useGrouping: false }), { from: owner });

        let lpTokenRole = web3.utils.soliditySha3("WRAPPED_LP_ROLE");
        await this.quadAdmin.register(lpTokenRole, this.lpToken1.address, { from: owner });
        await this.quadAdmin.register(lpTokenRole, this.lpToken2.address, { from: owner });

        this.governor = await MockGovernor.new();
        let governorRole = web3.utils.soliditySha3("GOVERNOR_ROLE");
        await this.quadAdmin.register(governorRole, this.governor.address, { from: owner });

        this.quadVault = await MockVault.new();
        let quadVaultRole = web3.utils.soliditySha3("QUAD_VAULT_ROLE");
        await this.quadAdmin.registerSingleton(quadVaultRole, this.quadVault.address, { from: owner });

        await this.lpToken1.approve(this.lpChamber.address, 10e18.toString(), { from: owner });
        await this.lpToken1.approve(this.lpChamber.address, 10e18.toString(), { from: submitter });
        await this.lpToken1.approve(this.lpChamber.address, 10e18.toString(), { from: random });

        await this.lpToken2.approve(this.lpChamber.address, 100e18.toLocaleString("fullwide", { useGrouping: false }), { from: owner });
        await this.lpToken2.approve(this.lpChamber.address, 100e18.toLocaleString("fullwide", { useGrouping: false }), { from: submitter });
        await this.lpToken2.approve(this.lpChamber.address, 100e18.toLocaleString("fullwide", { useGrouping: false }), { from: random });
    });

    it("shouldn't allow proposals from unknown addresses", async() => {
        await truffleAssert.reverts(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: random }), "Sender isn't the quad chamber"
        );
    });

    it("shouldn't be allowed to submit a proposal to non-governors", async() => {
        await truffleAssert.reverts(
            this.lpChamber.newProposal(random, "0x", owner, "Test proposal", { from: submitter }), "Address isn't a governor"
        );
    });

    it("should allow correct proposals", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        let proposal = await this.lpChamber.proposals(0);
        assert.isTrue(proposal.active);
        expect(proposal.proposer).equal(owner);
        expect(proposal.governor).equal(this.governor.address);
        assert.isNull(proposal.data);
        expect(proposal.quorumBips).bignumber.equal("500");
        expect(proposal.majorityBips).bignumber.equal("5100");
        //60 seconds tolerance to account for execution time
        expect(proposal.deadline).bignumber.closeTo(Math.trunc((new Date().getTime()) / 1000 + 60 * 60 * 48).toString(), "60");
        expect(proposal.description).equal("Test proposal");
    });

    it("should allow holders to vote and lockup the requested amount", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        let ownerToken1Balance = await this.lpToken1.balanceOf(owner);
        let ownerToken2Balance = await this.lpToken2.balanceOf(owner);
        let submitterToken1Balance = await this.lpToken1.balanceOf(submitter);

        await this.quadVault.shouldAutoMock(false);

        await this.quadVault.deposit(owner, this.lpToken1.address, ownerToken1Balance);
        await this.quadVault.deposit(owner, this.lpToken2.address, ownerToken2Balance);
        await this.quadVault.deposit(submitter, this.lpToken1.address, submitterToken1Balance);

        await truffleAssert.passes(
            this.lpChamber.vote("0", ownerToken1Balance, true, this.lpToken1.address, { from: owner })
        );
        //it should revert if a user who has already voted tries to submit a different vote
        await truffleAssert.reverts(
            this.lpChamber.vote("0", ownerToken2Balance, false, this.lpToken2.address, { from: owner }), "Cannot change vote"
        );

        await truffleAssert.passes(
            this.lpChamber.vote("0", ownerToken2Balance, true, this.lpToken2.address, { from: owner })
        );

        await truffleAssert.passes(
            this.lpChamber.vote("0", submitterToken1Balance, false, this.lpToken1.address, { from: submitter })
        );

        let ownerReceipt = await this.lpChamber.getVoterReceipt(0, owner);
        assert.isTrue(ownerReceipt.hasVoted);
        assert.isTrue(ownerReceipt.isFor);
        expect(ownerReceipt.depositedAmounts[0]).bignumber.equal(ownerToken1Balance);
        expect(ownerReceipt.depositedAmounts[1]).bignumber.equal(ownerToken2Balance);

        let submitterReceipt = await this.lpChamber.getVoterReceipt(0, submitter);
        assert.isTrue(submitterReceipt.hasVoted);
        assert.isFalse(submitterReceipt.isFor);
        expect(submitterReceipt.depositedAmounts[0]).bignumber.equal(submitterToken1Balance);
        expect(submitterReceipt.depositedAmounts[1]).bignumber.zero;

        let votes = await this.lpChamber.getProposalVotes(0);
        expect(votes.forVotes[0]).bignumber.equal(ownerToken1Balance);
        expect(votes.forVotes[1]).bignumber.equal(ownerToken2Balance);
        expect(votes.againstVotes[0]).bignumber.equal(submitterToken1Balance);
        expect(votes.againstVotes[1]).bignumber.zero;

        expect(await this.quadVault.lockedTokens(owner, this.lpToken1.address)).bignumber.equal(ownerToken1Balance);
        expect(await this.quadVault.lockedTokens(owner, this.lpToken2.address)).bignumber.equal(ownerToken2Balance);
        expect(await this.quadVault.lockedTokens(submitter, this.lpToken1.address)).bignumber.equal(submitterToken1Balance);
        expect(await this.quadVault.lockedTokens(submitter, this.lpToken2.address)).bignumber.zero;
    });

    it("shouldn't allow proposal evaluation before the deadline", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await truffleAssert.reverts(
            this.lpChamber.evaluateProposal(0), "Voting still ongoing"
        );
    });

    it("should deny proposals that didn't meet the quorum", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        //2% each
        let votesToken1 = (await this.lpToken1.totalSupply()).muln(2).divn(100);
        let votesToken2 = (await this.lpToken2.totalSupply()).muln(2).divn(100);

        await truffleAssert.passes(
            this.lpChamber.vote("0", votesToken1, true, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", votesToken2, true, this.lpToken2.address, { from: owner })
        );
        
        await increaseEVMTime(60 * 60 * 48);

        let multiplier = await this.lpChamber.POINTS_MULTIPLIER();
        //4%
        let expectedTotalVotes = multiplier.muln(4).divn(100);

        truffleAssert.eventEmitted(
            await this.lpChamber.evaluateProposal(0), "ProposalDenied", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(expectedTotalVotes);
                expect(ev.votesInFavor).bignumber.equal(expectedTotalVotes);
                expect(ev.votesAgainst).bignumber.zero;
                expect(ev.denyReason).bignumber.zero;

                return true;
            }
        );
    });

  it("should deny proposals that didn't reach majority", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );
        
        let token1perCent = (await this.lpToken1.totalSupply()).divn(100);
        let token2perCent = (await this.lpToken2.totalSupply()).divn(100);
        
        await truffleAssert.passes(
            this.lpChamber.vote("0", token1perCent.muln(2), true, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", token2perCent.muln(2), true, this.lpToken2.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", token1perCent.muln(4), false, this.lpToken1.address, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        let multiplier = await this.lpChamber.POINTS_MULTIPLIER();
        let expectedForVotes = multiplier.muln(4).divn(100);
        let expectedAgainstVotes = multiplier.muln(4).divn(100);
        let expectedTotalVotes = expectedAgainstVotes.add(expectedForVotes);

        truffleAssert.eventEmitted(
            await this.lpChamber.evaluateProposal(0), "ProposalDenied", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(expectedTotalVotes);
                expect(ev.votesInFavor).bignumber.equal(expectedForVotes);
                expect(ev.votesAgainst).bignumber.equal(expectedAgainstVotes);
                expect(ev.denyReason).bignumber.equal("1");

                return true;
            }
        );
    });

    it("shouldn't allow votes after the deadline", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.reverts(
            this.lpChamber.vote("0", "1", true, this.lpToken1.address, { from: owner }), "Proposal is inactive"
        );
    });

    it("should execute governors' no arguments functions on approved proposals", async () => {
        let governorContract = new web3.eth.Contract(this.governor.abi, this.governor.address);
        let encodedABI = governorContract.methods.mockFunctionNoArgs().encodeABI();

        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, encodedABI, owner, "Test proposal", { from: submitter })
        );

        let token1perCent = (await this.lpToken1.totalSupply()).divn(100);
        let token2perCent = (await this.lpToken2.totalSupply()).divn(100);
        

        await truffleAssert.passes(
            this.lpChamber.vote("0", token1perCent.muln(5), true, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", token2perCent, false, this.lpToken2.address, { from: submitter })
        );

        let multiplier = await this.lpChamber.POINTS_MULTIPLIER();
        let expectedForVotes = multiplier.muln(5).divn(100);
        let expectedAgainstVotes = multiplier.divn(100);
        let expectedTotalVotes = expectedAgainstVotes.add(expectedForVotes);

        await increaseEVMTime(60 * 60 * 48);
    
        truffleAssert.eventEmitted(
            await this.lpChamber.evaluateProposal(0), "ProposalApproved", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(expectedTotalVotes);
                expect(ev.votesInFavor).bignumber.equal(expectedForVotes);
                expect(ev.votesAgainst).bignumber.equal(expectedAgainstVotes);

                return true;
            }
        );

        assert.isTrue(await this.governor.noArgFunctionCalled());
    });

    it("should execute governors' functions on approved proposals", async () => {
        let arg1 = "20";
        let arg2 = random;

        let governorContract = new web3.eth.Contract(this.governor.abi, this.governor.address);
        let encodedABI = governorContract.methods.mockFunctionWithArgs(arg1, arg2).encodeABI();

        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, encodedABI, owner, "Test proposal", { from: submitter })
        );

        let token1perCent = (await this.lpToken1.totalSupply()).divn(100);
        let token2perCent = (await this.lpToken2.totalSupply()).divn(100);
        

        await truffleAssert.passes(
            this.lpChamber.vote("0", token1perCent.muln(5), true, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", token2perCent, false, this.lpToken2.address, { from: submitter })
        );

        let multiplier = await this.lpChamber.POINTS_MULTIPLIER();
        let expectedForVotes = multiplier.muln(5).divn(100);
        let expectedAgainstVotes = multiplier.divn(100);
        let expectedTotalVotes = expectedAgainstVotes.add(expectedForVotes);

        await increaseEVMTime(60 * 60 * 48);
    
        truffleAssert.eventEmitted(
            await this.lpChamber.evaluateProposal(0), "ProposalApproved", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(expectedTotalVotes);
                expect(ev.votesInFavor).bignumber.equal(expectedForVotes);
                expect(ev.votesAgainst).bignumber.equal(expectedAgainstVotes);

                return true;
            }
        );

        assert.isTrue(await this.governor.argFunctionCalled());
        expect(await this.governor.arg1()).bignumber.equal(arg1);
        expect(await this.governor.arg2()).equal(arg2);
    });

    it("should evaluate the proposal if it didn't already during a succesful withdraw", async () => {
        let governorContract = new web3.eth.Contract(this.governor.abi, this.governor.address);
        let encodedABI = governorContract.methods.mockFunctionNoArgs().encodeABI();

        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, encodedABI, owner, "Test proposal", { from: submitter })
        );

        let token1perCent = (await this.lpToken1.totalSupply()).divn(100);

        await truffleAssert.passes(
            this.lpChamber.vote("0", token1perCent.muln(5), true, this.lpToken1.address, { from: owner })
        );

        await increaseEVMTime(60 * 60 * 48);

        truffleAssert.eventEmitted(
            await this.lpChamber.withdraw(0, { from: owner }), "ProposalApproved"
        );
    });

    it("shouldn't allow withdrawals while voting is still ongoing", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.lpChamber.vote("0", 1e18.toString(), false, this.lpToken1.address, { from: owner })
        );

        await truffleAssert.reverts(this.lpChamber.withdraw(0, { from: owner }), "Voting still ongoing");

        await truffleAssert.passes(
            this.lpChamber.vote("0", 1e18.toString(), false, this.lpToken2.address, { from: submitter })
        );

        await truffleAssert.reverts(this.lpChamber.withdraw(0, { from: submitter }), "Voting still ongoing");
    });


    it("should withdraw the correct amount of tokens", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        let token1perCent = (await this.lpToken1.totalSupply()).divn(100);
        let token2perCent = (await this.lpToken2.totalSupply()).divn(100);

        let ownerToken1Deposit = token1perCent.muln(3);
        let ownerToken2Deposit = token2perCent.muln(2);
        let submitterToken1Deposit = token1perCent.muln(5);

        await this.quadVault.shouldAutoMock(false);
        await this.quadVault.deposit(owner, this.lpToken1.address, ownerToken1Deposit);
        await this.quadVault.deposit(owner, this.lpToken2.address, ownerToken2Deposit);
        await this.quadVault.deposit(submitter, this.lpToken1.address, submitterToken1Deposit);

        await truffleAssert.passes(
            this.lpChamber.vote("0", ownerToken1Deposit, false, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", ownerToken2Deposit, false, this.lpToken2.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", submitterToken1Deposit, false, this.lpToken1.address, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        truffleAssert.eventEmitted(
            await this.lpChamber.withdraw(0, { from: submitter }), "ProposalDenied"
        );
        truffleAssert.eventNotEmitted(
            await this.lpChamber.withdraw(0, { from: owner }), "ProposalDenied"
        );

        expect(await this.quadVault.lockedTokens(owner, this.lpToken1.address)).bignumber.zero;
        expect(await this.quadVault.lockedTokens(owner, this.lpToken2.address)).bignumber.zero;
        expect(await this.quadVault.lockedTokens(submitter, this.lpToken1.address)).bignumber.zero;
    });

    it("shouldn't allow a user to withdraw twice", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.lpChamber.vote("0", 1e18.toString(), false, this.lpToken1.address, { from: owner })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.passes(
            this.lpChamber.withdraw(0, { from: owner })
        );
        await truffleAssert.reverts(
            this.lpChamber.withdraw(0, { from: owner }), "You have already withdrawn the funds for this vote"
        );
    });

    it("should revert if a user who didn't vote tries to withdraw", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.reverts(
            this.lpChamber.withdraw(0, { from: owner }), "You haven't voted for this proposal"
        );
    });

    it("should select the correct withdraw amount when a user has voted multiple proposals", async () => {
        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.lpChamber.newProposal(this.governor.address, "0x", owner, "Test proposal", { from: submitter })
        );

        let proposal0Token1OwnerVote = (await this.lpToken1.totalSupply()).divn(100);
        let proposal0Token2OwnerVote = (await this.lpToken2.totalSupply()).divn(100);
        let proposal0Token1SubmitterVote = proposal0Token1OwnerVote.muln(3);
        let proposal1Token1OwnerVote = proposal0Token1OwnerVote.muln(2)
        let proposal1Token2OwnerVote = proposal0Token2OwnerVote.divn(2);
        let proposal1Token2SubmitterVote = proposal0Token2OwnerVote.muln(4);

        await this.quadVault.shouldAutoMock(false);
        await this.quadVault.deposit(owner, this.lpToken1.address, proposal0Token1OwnerVote.add(proposal1Token1OwnerVote));
        await this.quadVault.deposit(owner, this.lpToken2.address, proposal0Token2OwnerVote.add(proposal1Token2OwnerVote)); 
        await this.quadVault.deposit(submitter, this.lpToken1.address, proposal0Token1SubmitterVote);
        await this.quadVault.deposit(submitter, this.lpToken2.address, proposal1Token2SubmitterVote);

        await truffleAssert.passes(
            this.lpChamber.vote("0", proposal0Token1OwnerVote, false, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", proposal0Token2OwnerVote, false, this.lpToken2.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("0", proposal0Token1SubmitterVote, false, this.lpToken1.address, { from: submitter })
        );

        await truffleAssert.passes(
            this.lpChamber.vote("1", proposal1Token1OwnerVote, false, this.lpToken1.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("1", proposal1Token2OwnerVote, false, this.lpToken2.address, { from: owner })
        );
        await truffleAssert.passes(
            this.lpChamber.vote("1", proposal1Token2SubmitterVote, false, this.lpToken2.address, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.passes(
            this.lpChamber.withdraw(0, { from: submitter })
        );
        await truffleAssert.passes(
            this.lpChamber.withdraw(0, { from: owner })
        );

        expect((await this.quadVault.balances(owner, this.lpToken1.address))
            .sub(await this.quadVault.lockedTokens(owner, this.lpToken1.address)))
            .bignumber.equal(proposal0Token1OwnerVote);
        expect((await this.quadVault.balances(owner, this.lpToken2.address))
            .sub(await this.quadVault.lockedTokens(owner, this.lpToken2.address)))
            .bignumber.equal(proposal0Token2OwnerVote);
        expect(await this.quadVault.lockedTokens(submitter, this.lpToken1.address)).bignumber.zero;
    
        await truffleAssert.passes(
            this.lpChamber.withdraw(1, { from: submitter })
        );
        await truffleAssert.passes(
            this.lpChamber.withdraw(1, { from: owner })
        );

        expect(await this.quadVault.lockedTokens(owner, this.lpToken1.address)).bignumber.zero;
        expect(await this.quadVault.lockedTokens(owner, this.lpToken2.address)).bignumber.zero;
        expect(await this.quadVault.lockedTokens(submitter, this.lpToken2.address)).bignumber.zero;
    });

    async function increaseEVMTime(timeToAdd) {
        return new Promise(resolve => {
            web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [timeToAdd], id: 0}, () => {
                web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0}, resolve);
            });
        });
    }

})