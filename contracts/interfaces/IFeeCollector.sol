pragma solidity ^0.6.0;

interface IFeeCollector {

    event RecipientAdded(address indexed addr, uint256 feeShare);
    event RecipientRemoved(address indexed addr);

    event FeesDistributed(uint256 feeAmount);

    event FeeWithdrawal(address indexed addr, uint256 amount);

    function addRecipient(address addr, uint256 shares) external;
    function removeRecipient(address addr) external;

    function distributeFees() external;

    function getWithdrawableFees(address addr) external view returns (uint256);
    function getPendingBurnAmount() external view returns (uint256 toBeBurnt);

    function changeBurnShares(uint256 burnShares) external;

    function withdraw() external returns (uint256);
}