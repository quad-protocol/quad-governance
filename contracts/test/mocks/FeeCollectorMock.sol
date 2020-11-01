pragma solidity ^0.6.0;

contract FeeCollectorMock {

    bool public burnSharesChanged;

    function changeBurnShares(uint256 newBurnShares) public {
        burnSharesChanged = true;
    }
}