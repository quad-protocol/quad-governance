pragma solidity ^0.6.0;

contract FeeManagerMock {

    bool public feeBipsChanged;

    function changeFeeBips(uint256 newFees) public {
        feeBipsChanged = true;
    }
}