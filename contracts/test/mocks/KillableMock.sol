pragma solidity ^0.6.0;

contract KillableMock {

    bool public killCalled;

    function kill() external {
        killCalled = true;
    }

}