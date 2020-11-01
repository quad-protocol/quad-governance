pragma solidity ^0.6.0;

interface ILPChamber {

    function newProposal(address targetGovernor, bytes calldata data, address proposer, string calldata description) external;

    function vote(uint256 pid, uint256 tokenAmount, bool isFor, address voteToken) external;
    function withdraw(uint256 pid) external;

    function evaluateProposal(uint256 pid) external;

    function whiteListToken(address token) external;
}