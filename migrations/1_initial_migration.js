const Migrations = artifacts.require("Migrations");

const QuadChamber = artifacts.require("QuadChamber");
const LPChamber = artifacts.require("LPChamber");
const PoolGovernor = artifacts.require("PoolGovernor");
const KillswitchGovernor = artifacts.require("KillswitchGovernor");
const FeeGovernor = artifacts.require("FeeGovernor");

const quadAdmin = ""; //QuadAdmin's address goes here

module.exports = async function (deployer, network) {
    //network test skips migrations
    if (network == "test")
        return;

    await deployer.deploy(Migrations);

    await deployer.deploy(QuadChamber, 500, 5100, 60 * 60 * 48, 500, quadAdmin);
    await deployer.deploy(LPChamber, 2000, 5100, 60 * 60 * 48, quadAdmin);
    await deployer.deploy(PoolGovernor, quadAdmin);
    await deployer.deploy(KillswitchGovernor, quadAdmin);
    await deployer.deploy(FeeGovernor, quadAdmin);
};
