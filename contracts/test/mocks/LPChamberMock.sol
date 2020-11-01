pragma solidity ^0.6.0;

contract LPChamberMock {

    struct ProposalMock {  
        address governor;
        bytes data;
        address proposer;
        string description;
    }


    ProposalMock public lastProposalMock;

    function newProposal(address targetGovernor, bytes calldata data, address proposer, string calldata description) external {
        lastProposalMock = ProposalMock(
            targetGovernor,
            data,
            proposer,
            description
        );
    }

}