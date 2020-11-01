pragma solidity ^0.6.0;

import "@quad/quad-linker/contracts/Governor.sol";

import "./interfaces/IFeeManager.sol";
import "./interfaces/IFeeCollector.sol";

contract FeeGovernor is Governor {

    bytes32 internal constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
    bytes32 internal constant FEE_COLLECTOR_ROLE = keccak256("FEE_COLLECTOR_ROLE");

    constructor(IAccessControl accessControl) public Governor(accessControl) {
        subscribeSingleton(FEE_MANAGER_ROLE, GOVERNOR_ROLE);
        subscribeSingleton(FEE_COLLECTOR_ROLE, GOVERNOR_ROLE);
    }

    //Change the fee bips (1/10000) per transfer.
    function setTransferFeeBips(uint256 newFeeBips) external onlyGovernance {
        IFeeManager feeManager = IFeeManager(resolveSingleton(FEE_MANAGER_ROLE));

        feeManager.changeFeeBips(newFeeBips);
    }

    //Change the burn shares (not bips!).
    //To get the total fee shares read the FeeCollector contract.
    function changeBurnShares(uint256 newBurnShares) external onlyGovernance {
        IFeeCollector feeCollector = IFeeCollector(resolveSingleton(FEE_COLLECTOR_ROLE));

        feeCollector.changeBurnShares(newBurnShares);
    }

}