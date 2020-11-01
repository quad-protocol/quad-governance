const KillGovernor = artifacts.require("KillswitchGovernor");

const QuadAdminMock = artifacts.require("QuadAdminMock");
const KillableMock = artifacts.require("KillableMock");

const truffleAssert = require("truffle-assertions");
const { assert } = require("chai");

contract("KillswitchGovernor", addresses => {

    const owner = addresses[0];
    const governance = addresses[1];

    beforeEach(async () => {
        this.quadAdmin = await QuadAdminMock.new({ from: owner });
        this.killGovernor = await KillGovernor.new(this.quadAdmin.address, { from: owner });

        this.killable = await KillableMock.new({ from: owner });
        await this.quadAdmin.register(web3.utils.soliditySha3("KILLABLE_ROLE"), this.killable.address);
        await this.quadAdmin.register(web3.utils.soliditySha3("GOVERNANCE_ROLE"), governance);
    });

    it("shouldn't allow calls from non-governance", async () => {
        await truffleAssert.reverts(
            this.killGovernor.doKills({ from: owner }), "Address doesn't have the governance role"
        );
    });

    it("should kill the contracts", async () => {
        await truffleAssert.passes(
            this.killGovernor.doKills({ from: governance })
        );

        assert.isTrue(await this.killable.killCalled());
    });

});