pragma solidity ^0.6.0;

interface IQuadLGE {
    function startLGE(address pairingToken, string calldata name, string calldata symbol, uint256 endTimestamp, bool wrappable) external;
}