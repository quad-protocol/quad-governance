pragma solidity ^0.6.0;

import "@quad/quad-linker/contracts/RemoteAccessControl.sol";

contract RemoteAccessControlMock is RemoteAccessControl {

    constructor(IAccessControl accessControl) public RemoteAccessControl(ROOT, false, accessControl) {}

    function _resolveSingleton(bytes32 role) external view returns (address) {
        return super.resolveSingleton(role);
    }

    function _resolve(bytes32 role) external view returns (address[] memory members) {
        EnumerableSet.AddressSet storage set = resolve(role);
        members = new address[](set.length());

        for (uint256 i = 0; i < members.length; i++) {
            members[i] = set.at(i);
        }
    }

    function _subscribe(bytes32 role, bytes32 asRole) external {
        super.subscribe(role, asRole);
    }

    function _subscribeSingleton(bytes32 role, bytes32 asRole) external {
        super.subscribeSingleton(role, asRole);
    }

}