pragma solidity ^0.6.0;

interface ILPTokenWrapper {

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function toggleWrappable(bool canWrap) external;

}