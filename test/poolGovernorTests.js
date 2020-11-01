const PoolGovernor = artifacts.require("PoolGovernor");

const QuadAdminMock = artifacts.require("QuadAdminMock");
const LGEMock = artifacts.require("LGEMock");
const LPWrapperMock = artifacts.require("LPWrapperMock");

const truffleAssert = require("truffle-assertions");
const { assert } = require("chai");

contract("PoolGovernor", addresses => {

    const owner = addresses[0];
    const governance = addresses[1];

    beforeEach(async () => {
        this.quadAdmin = await QuadAdminMock.new({ from: owner });
        this.poolGovernor = await PoolGovernor.new(this.quadAdmin.address, { from: owner });

        this.lge = await LGEMock.new({ from: owner });
        this.lpWrapper = await LPWrapperMock.new({ from: owner });
        await this.quadAdmin.registerSingleton(web3.utils.soliditySha3("SECONDARY_LGE_ROLE"), this.lge.address);
        await this.quadAdmin.register(web3.utils.soliditySha3("WRAPPED_LP_ROLE"), this.lpWrapper.address);
        await this.quadAdmin.register(web3.utils.soliditySha3("GOVERNANCE_ROLE"), governance);
    });

    it("shouldn't allow calls from non-governance", async () => {
        await truffleAssert.reverts(
            this.poolGovernor.addPool(owner, "TEST", "TEST", 0, { from: owner }), "Address doesn't have the governance role"
        );

        await truffleAssert.reverts(
            this.poolGovernor.toggleWrappable(false, { from: owner }), "Address doesn't have the governance role"
        );
    });

    it("should call startLGE", async () => {
        await truffleAssert.passes(
            this.poolGovernor.addPool(owner, "TEST", "TEST", 0, { from: governance })
        );

        assert.isTrue(await this.lge.addPoolCalled());
        assert.isTrue(await this.lge.isWrappable());
    });

    it("should call toggleWrappable", async () => {
        await truffleAssert.passes(
            this.poolGovernor.toggleWrappable(false, { from: governance })
        );

        assert.isTrue(await this.lpWrapper.toggleWrappableCalled());
        assert.isFalse(await this.lpWrapper.isWrappable());
    });

});