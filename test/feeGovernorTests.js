const FeeGovernor = artifacts.require("FeeGovernor");

const QuadAdminMock = artifacts.require("QuadAdminMock");
const FeeManagerMock = artifacts.require("FeeManagerMock");
const FeeCollectorMock = artifacts.require("FeeCollectorMock");

const truffleAssert = require("truffle-assertions");
const { assert } = require("chai");

contract("FeeGovernor", addresses => {

    const owner = addresses[0];
    const governance = addresses[1];

    beforeEach(async () => {
        this.quadAdmin = await QuadAdminMock.new({ from: owner });
        this.feeGovernor = await FeeGovernor.new(this.quadAdmin.address, { from: owner });

        this.feeManager = await FeeManagerMock.new({ from: owner });
        this.feeCollector = await FeeCollectorMock.new({ from: owner });
        await this.quadAdmin.registerSingleton(web3.utils.soliditySha3("FEE_MANAGER_ROLE"), this.feeManager.address);
        await this.quadAdmin.registerSingleton(web3.utils.soliditySha3("FEE_COLLECTOR_ROLE"), this.feeCollector.address);
        await this.quadAdmin.register(web3.utils.soliditySha3("GOVERNANCE_ROLE"), governance);
    });

    it("shouldn't allow calls from non-governance", async () => {
        await truffleAssert.reverts(
            this.feeGovernor.setTransferFeeBips(500, { from: owner }), "Address doesn't have the governance role"
        );

        await truffleAssert.reverts(
            this.feeGovernor.changeBurnShares(500, { from: owner }), "Address doesn't have the governance role"
        );
    });

    it("should change the transfer fees", async () => {
        await truffleAssert.passes(
            this.feeGovernor.setTransferFeeBips(500, { from: governance })
        );

        assert.isTrue(await this.feeManager.feeBipsChanged());
    });

    it("should change the transfer burn", async () => {
        await truffleAssert.passes(
            this.feeGovernor.changeBurnShares(500, { from: governance })
        );

        assert.isTrue(await this.feeCollector.burnSharesChanged());
    });

});