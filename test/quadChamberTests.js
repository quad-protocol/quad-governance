const QuadChamber = artifacts.require("QuadChamber");

const QuadAdminMock = artifacts.require("QuadAdminMock");
const LPChamberMock = artifacts.require("LPChamberMock");
const ERC20Mock = artifacts.require("ERC20Mock");
const MockGovernor = artifacts.require("MockGovernor");

const truffleAssert = require("truffle-assertions");

const chai = require("chai");
chai.use(require("chai-bn")(require("bn.js")));

const { expect, assert } = chai; 


contract("QuadChamber", addresses => {

    let owner = addresses[0];
    let submitter = addresses[1];
    let random = addresses[2];

    beforeEach(async () => {
        this.quadAdmin = await QuadAdminMock.new({ from: owner });

        this.lpChamber = await LPChamberMock.new();
        let lpChamberRole = web3.utils.soliditySha3("LP_CHAMBER_ROLE");
        await this.quadAdmin.registerSingleton(lpChamberRole, this.lpChamber.address);

        this.quadToken = await ERC20Mock.new(10e18.toString(), { from: owner });
        let quadTokenRole =  web3.utils.soliditySha3("QUAD_TOKEN_ROLE");
        await this.quadAdmin.registerSingleton(quadTokenRole, this.quadToken.address);
        await this.quadToken.transfer(submitter, 5e18.toString(), { from: owner });

        this.governor = await MockGovernor.new();
        let governorRole = web3.utils.soliditySha3("GOVERNOR_ROLE");
        await this.quadAdmin.register(governorRole, this.governor.address);

        this.quadChamber = await QuadChamber.new(500, 5100, 60 * 60 * 48, 500, this.quadAdmin.address, { from: owner });

        await this.quadToken.approve(this.quadChamber.address, 10e18.toString(), { from: owner });
        await this.quadToken.approve(this.quadChamber.address, 10e18.toString(), { from: submitter });
        await this.quadToken.approve(this.quadChamber.address, 10e18.toString(), { from: random });
    });

    it("shouldn't be allowed to submit a proposal with no tokens", async() => {
        await truffleAssert.reverts(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: random }), "ERC20: transfer amount exceeds balance"
        );
    });

    it("shouldn't be allowed to submit a proposal to non-governors", async() => {
        await truffleAssert.reverts(
            this.quadChamber.newProposal(random, "0x", "Test proposal", { from: submitter }), "Address isn't a governor"
        );
    });

    it("should allow correct proposals and lockup the required amount", async () => {
        let previousBalance = await this.quadToken.balanceOf(submitter);

        let timestamp = await currentTime();
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );
        
        let expectedLockedTokens = (await this.quadToken.totalSupply()).muln(5).divn(100);

        expect(await this.quadToken.balanceOf(submitter)).bignumber.equal(previousBalance.sub(expectedLockedTokens));
        
        let receipt = await this.quadChamber.getVoterReceipt("0", submitter);
        assert.isTrue(receipt.isFor);
        assert.isFalse(receipt.hasWithdrawn);
        expect(receipt.voteAmount).bignumber.equal(expectedLockedTokens);

        let proposal = await this.quadChamber.proposals(0);
        assert.isTrue(proposal.active);
        expect(proposal.proposer).equal(submitter);
        expect(proposal.governor).equal(this.governor.address);
        assert.isNull(proposal.data);
        expect(proposal.forVotes).bignumber.equal(expectedLockedTokens);
        expect(proposal.againstVotes).bignumber.zero;
        //In this test quorum and lockAmount are the same
        expect(proposal.quorum).bignumber.equal(expectedLockedTokens);
        expect(proposal.majorityBips).bignumber.equal("5100");
        expect(proposal.deadline).bignumber.equal((timestamp + 60 * 60 * 48).toString());
        expect(proposal.description).equal("Test proposal");
    });

    it("should allow holders to vote and lockup the requested amount", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        let submitterBalance = await this.quadToken.balanceOf(submitter);
        let expectedProposalLockup = (await this.quadToken.totalSupply()).muln(5).divn(100);
        //it should revert if a user who has already voted tries to submit a different vote
        await truffleAssert.reverts(
            this.quadChamber.vote("0", submitterBalance, false, { from: submitter }), "Cannot change vote"
        );

        await truffleAssert.passes(
            this.quadChamber.vote("0", submitterBalance, true, { from: submitter })
        );

        let ownerBalance = await this.quadToken.balanceOf(owner);

        await truffleAssert.passes(
            this.quadChamber.vote("0", ownerBalance, false, { from: owner })
        );

        let submitterReceipt = await this.quadChamber.getVoterReceipt(0, submitter);
        assert.isTrue(submitterReceipt.isFor);
        expect(submitterReceipt.voteAmount).bignumber.equal(submitterBalance.add(expectedProposalLockup));

        let ownerReceipt = await this.quadChamber.getVoterReceipt(0, owner);
        assert.isFalse(ownerReceipt.isFor);
        expect(ownerReceipt.voteAmount).bignumber.equal(ownerBalance);

        let proposal = await this.quadChamber.proposals(0);
        expect(proposal.forVotes).bignumber.equal(submitterBalance.add(expectedProposalLockup));
        expect(proposal.againstVotes).bignumber.equal(ownerBalance);
    });

    it("shouldn't allow to evaluate proposals until the deadline", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await truffleAssert.reverts(
            this.quadChamber.evaluateProposal(0), "Voting still ongoing"
        );
    });

    it("should deny proposals that didn't meet the quorum", async () => {
        //update governor data to set an higher quorum
        await this.quadChamber.changeGovernorData(this.governor.address, "600", "5100", { from: owner });

        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );
        
        await increaseEVMTime(60 * 60 * 48);

        let expectedTotalVotes = (await this.quadToken.totalSupply()).muln(5).divn(100)

        truffleAssert.eventEmitted(
            await this.quadChamber.evaluateProposal(0), "ProposalDenied", ev => {
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
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        let submitterVotes = (await this.quadToken.totalSupply()).muln(5).divn(100);

        //same votes as submitter
        await truffleAssert.passes(
            this.quadChamber.vote("0", submitterVotes, false, { from: owner })
        );

        await increaseEVMTime(60 * 60 * 48);

        truffleAssert.eventEmitted(
            await this.quadChamber.evaluateProposal(0), "ProposalDenied", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(submitterVotes.muln(2));
                expect(ev.votesInFavor).bignumber.equal(submitterVotes);
                expect(ev.votesAgainst).bignumber.equal(submitterVotes);
                expect(ev.denyReason).bignumber.equal("1");

                return true;
            }
        );
    });

    it("shouldn't allow votes after the deadline", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        let balance = await this.quadToken.balanceOf(submitter);

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.reverts(
            this.quadChamber.vote("0", balance, true, { from: submitter }), "Proposal is inactive"
        );
    });

    it("should send approved proposals to the LP chamber", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x01", "Test proposal", { from: submitter })
        );

        let ownerVotes = web3.utils.toBN(1e18.toString());
        let submitterVotes = await this.quadToken.balanceOf(submitter);
        let proposalLockup = (await this.quadToken.totalSupply()).muln(5).divn(100);
        let totalVotes = ownerVotes.add(submitterVotes).add(proposalLockup);

        await truffleAssert.passes(
            this.quadChamber.vote("0", ownerVotes, false, { from: owner })
        );
        await truffleAssert.passes(
            this.quadChamber.vote("0", submitterVotes, true, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);
    
        truffleAssert.eventEmitted(
            await this.quadChamber.evaluateProposal(0), "ProposalApproved", ev => {
                expect(ev.pid).bignumber.zero;
                expect(ev.totalVotes).bignumber.equal(totalVotes);
                expect(ev.votesInFavor).bignumber.equal(submitterVotes.add(proposalLockup));
                expect(ev.votesAgainst).bignumber.equal(ownerVotes);

                return true;
            }
        );

        let receivedProposal = await this.lpChamber.lastProposalMock();
        expect(receivedProposal.governor).equal(this.governor.address);
        expect(receivedProposal.data).equal("0x01");
        expect(receivedProposal.proposer).equal(submitter);
        expect(receivedProposal.description).equal("Test proposal");
    });

    it("should evaluate the proposal if it didn't already during a succesful withdraw", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);
        //the proposal gets approved because for the sake of the tests the quorum is the same as the proposal lockup
        truffleAssert.eventEmitted(
            await this.quadChamber.withdraw(0, { from: submitter }), "ProposalApproved"
        );
    });

    it("shouldn't allow withdrawals while voting is still ongoing", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await truffleAssert.reverts(this.quadChamber.withdraw(0, { from: submitter }), "Voting still ongoing");

        await truffleAssert.passes(
            this.quadChamber.vote("0", 1e18.toString(), false, { from: owner })
        );

        await truffleAssert.reverts(this.quadChamber.withdraw(0, { from: owner }), "Voting still ongoing");
    });


    it("should withdraw the correct amount of tokens", async () => {
        let submitterBalance = await this.quadToken.balanceOf(submitter);
        let ownerBalance = await this.quadToken.balanceOf(owner);

        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.quadChamber.vote("0", ownerBalance.divn(7), false, { from: owner })
        );
        await truffleAssert.passes(
            this.quadChamber.vote("0", submitterBalance.divn(2), true, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        truffleAssert.eventEmitted(
            await this.quadChamber.withdraw(0, { from: submitter }), "ProposalApproved"
        );
        truffleAssert.eventNotEmitted(
            await this.quadChamber.withdraw(0, { from: owner }), "ProposalApproved"
        );

        expect(await this.quadToken.balanceOf(submitter)).bignumber.equal(submitterBalance);
        expect(await this.quadToken.balanceOf(owner)).bignumber.equal(ownerBalance);
    });

    it("shouldn't allow a user to withdraw twice", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.quadChamber.vote("0", 1e18.toString(), false, { from: owner })
        );
        await truffleAssert.passes(
            this.quadChamber.vote("0", 3e18.toString(), true, { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.passes(
            this.quadChamber.withdraw(0, { from: submitter })
        );
        await truffleAssert.reverts(
            this.quadChamber.withdraw(0, { from: submitter }), "You have already withdrawn the funds for this vote"
        );
        await truffleAssert.passes(
            this.quadChamber.withdraw(0, { from: owner })
        );
        await truffleAssert.reverts(
            this.quadChamber.withdraw(0, { from: owner }), "You have already withdrawn the funds for this vote"
        );
    });

    it("should revert if a user who didn't vote tries to withdraw", async () => {
        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.reverts(
            this.quadChamber.withdraw(0, { from: random }), "You haven't voted for this proposal"
        );
    });

    it("should select the correct withdraw amount when a user has voted multiple proposals", async () => {
        let previousOwnerBalance = await this.quadToken.balanceOf(owner);
        let previousSubmitterBalance = await this.quadToken.balanceOf(submitter);

        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: submitter })
        );

        await truffleAssert.passes(
            this.quadChamber.newProposal(this.governor.address, "0x", "Test proposal", { from: owner })
        );

        let lockupAmount = (await this.quadToken.totalSupply()).muln(5).divn(100);
        let proposal0OwnerVote = web3.utils.toBN(2e18.toString());
        let proposal0SubmitterVote = web3.utils.toBN(1e18.toString());

        await truffleAssert.passes(
            this.quadChamber.vote("0", proposal0OwnerVote, false, { from: owner })
        );
        await truffleAssert.passes(
            this.quadChamber.vote("0", proposal0SubmitterVote, true, { from: submitter })
        );

        let proposal1OwnerVote = web3.utils.toBN(1e18.toString());
        let proposal1SubmitterVote = web3.utils.toBN(2e18.toString());

        await truffleAssert.passes(
            this.quadChamber.vote("1", proposal1OwnerVote, true, { from: owner })
        );
        await truffleAssert.passes(
            this.quadChamber.vote("1", proposal1SubmitterVote, false, { from: submitter })
        );

        let proposal1OwnerBalance = await this.quadToken.balanceOf(owner);
        let proposal1SubmitterBalance = await this.quadToken.balanceOf(submitter);

        await increaseEVMTime(60 * 60 * 48);

        await truffleAssert.passes(
            this.quadChamber.withdraw(0, { from: submitter })
        );
        await truffleAssert.passes(
            this.quadChamber.withdraw(0, { from: owner })
        );

        expect(await this.quadToken.balanceOf(owner)).bignumber.equal(proposal1OwnerBalance.add(proposal0OwnerVote));
        expect(await this.quadToken.balanceOf(submitter)).bignumber.equal(proposal1SubmitterBalance.add(proposal0SubmitterVote).add(lockupAmount));

        await truffleAssert.passes(
            this.quadChamber.withdraw(1, { from: submitter })
        );
        await truffleAssert.passes(
            this.quadChamber.withdraw(1, { from: owner })
        );

        expect(await this.quadToken.balanceOf(owner)).bignumber.equal(previousOwnerBalance);
        expect(await this.quadToken.balanceOf(submitter)).bignumber.equal(previousSubmitterBalance);
    });

    async function currentTime() {
        return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
    }

    async function increaseEVMTime(timeToAdd) {
        return new Promise(resolve => {
            web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [timeToAdd], id: 0}, () => {
                web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 0}, resolve);
            });
        });
    }

})