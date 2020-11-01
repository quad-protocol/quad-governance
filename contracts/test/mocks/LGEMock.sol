pragma solidity ^0.6.0;

contract LGEMock {

    bool public addPoolCalled;
    bool public isWrappable;

    function startLGE(address token, string calldata name, string calldata symbol, uint256 endTimestamp, bool wrappingEnabled) external {
        addPoolCalled = true;
        isWrappable = wrappingEnabled;
    }

}