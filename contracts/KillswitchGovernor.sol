pragma solidity ^0.6.0;

import "@quad/quad-linker/contracts/Governor.sol";

import "./interfaces/IKillable.sol";

contract KillswitchGovernor is Governor {

    bytes32 internal constant KILLABLE_ROLE = keccak256("KILLABLE_ROLE");

    constructor(IAccessControl accessControl) public Governor(accessControl) {
        subscribe(KILLABLE_ROLE, GOVERNOR_ROLE);
    }

    function doKills() external onlyGovernance {
        EnumerableSet.AddressSet storage killables = resolve(KILLABLE_ROLE);

        for (uint256 i = 0; i < killables.length(); i++) {
            IKillable(killables.at(i)).kill();
        }
    }
}