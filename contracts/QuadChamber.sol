pragma solidity ^0.6.0;

import "./SharedGovernance.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/ILPChamber.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";

contract QuadChamber is SharedGovernance {

    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Proposal {
        bool active;
        address proposer;
        address governor;
        bytes data;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 quorum;
        uint256 majorityBips;
        uint256 deadline;
        mapping(address => Receipt) voters;
        string description;
    }

    struct Receipt {
        uint256 voteAmount;
        bool isFor;
        bool hasWithdrawn;
    }

    bytes32 internal constant QUAD_TOKEN_ROLE = keccak256("QUAD_TOKEN_ROLE");

    uint256 public proposalLockBips;

    uint256 public totalProposals;

    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256[]) public votedProposals;
    mapping(address => uint256[]) public activeVotedProposals;
    mapping(address => uint256[]) public proposers;

    constructor(uint256 defaultQuorumBips, uint256 defaultMajorityBips, uint256 defaultProposalsDeadline, uint256 defaultProposalLockBips,
                IAccessControl accessControl) public SharedGovernance(defaultQuorumBips, defaultMajorityBips, defaultProposalsDeadline, accessControl) {
        proposalLockBips = defaultProposalLockBips;
        requestRole(QUAD_CHAMBER_ROLE, address(this), true);
        subscribeSingleton(QUAD_TOKEN_ROLE, QUAD_CHAMBER_ROLE);
        subscribeSingleton(LP_CHAMBER_ROLE, QUAD_CHAMBER_ROLE);
    }

    event VoteCasted(address indexed voter, uint256 indexed pid, bool isFor);
    //add ffs
    event ProposalLockBipsChanged(uint256 indexed newAmount, uint256 indexed oldAmount);

    function newProposal(address targetGovernor, bytes calldata data, string calldata description) external {
        (uint256 quorumBips, uint256 majorityBips) = getGovernorData(targetGovernor);
        
        IERC20 quadToken = IERC20(resolveSingleton(QUAD_TOKEN_ROLE));
        
        uint256 quadTotalSupply = quadToken.totalSupply();
        uint256 lockupAmount = quadTotalSupply.mul(proposalLockBips).div(10000);
        require(quadToken.transferFrom(msg.sender, address(this), lockupAmount));

        uint256 quorum = quadTotalSupply.mul(quorumBips).div(10000);
        proposals[totalProposals] = Proposal(
            true,
            msg.sender,
            targetGovernor,
            data,
            lockupAmount,
            0,
            quorum,
            majorityBips,
            now.add(proposalsDeadline),
            description
        );

        Receipt storage receipt = proposals[totalProposals].voters[msg.sender];
        receipt.voteAmount = lockupAmount;
        receipt.isFor = true;

        proposers[msg.sender].push(totalProposals);
        votedProposals[msg.sender].push(totalProposals);
        activeVotedProposals[msg.sender].push(totalProposals);

        emit NewProposal(totalProposals, targetGovernor, data, quorum, majorityBips, now.add(proposalsDeadline));

        totalProposals++;
    }

    function vote(uint256 pid, uint256 voteAmount, bool isFor) external {
        require(voteAmount > 0, "Insufficient vote amount!");

        Proposal storage proposal = proposals[pid];
        require(proposal.active && proposal.deadline > now, "Proposal is inactive");

        require(IERC20(resolveSingleton(QUAD_TOKEN_ROLE)).transferFrom(msg.sender, address(this), voteAmount));

        Receipt storage receipt = proposal.voters[msg.sender];
        if (receipt.voteAmount > 0)
            require(receipt.isFor == isFor, "Cannot change vote");
        else {
            receipt.isFor = isFor;
            activeVotedProposals[msg.sender].push(pid);
            votedProposals[msg.sender].push(pid);

            emit VoteCasted(msg.sender, pid, isFor);
        }

        receipt.voteAmount = receipt.voteAmount.add(voteAmount);

        if (isFor) 
            proposal.forVotes = proposal.forVotes.add(voteAmount);
        else
            proposal.againstVotes = proposal.againstVotes.add(voteAmount);
    }

    function evaluateProposal(uint256 pid) public override {
        Proposal storage proposal = proposals[pid];

        require(now >= proposal.deadline, "Voting still ongoing");
        require(proposal.active, "Proposal is inactive");

        proposal.active = false;
        uint256 totalVotes = proposal.forVotes.add(proposal.againstVotes);

        if (totalVotes < proposal.quorum) {
            emit ProposalDenied(pid, totalVotes, proposal.forVotes, proposal.againstVotes, DenyReason.quorum);
            return;
        }

        (, uint256 majorityBips) = getGovernorData(proposal.governor);

        if (proposal.forVotes < totalVotes.mul(majorityBips).div(10000)) {
            emit ProposalDenied(pid, totalVotes, proposal.forVotes, proposal.againstVotes, DenyReason.majority);
            return;
        }

        emit ProposalApproved(pid, totalVotes, proposal.forVotes, proposal.againstVotes);

        address lpChamber = resolveSingleton(LP_CHAMBER_ROLE);

        ILPChamber(lpChamber).newProposal(proposal.governor, proposal.data, proposal.proposer, proposal.description);
    }

    function withdraw(uint256 pid) external override {
        Proposal storage proposal = proposals[pid];

        require(now >= proposal.deadline, "Voting still ongoing");

        Receipt storage receipt = proposal.voters[msg.sender];
        require(receipt.voteAmount > 0, "You haven't voted for this proposal");
        require(!receipt.hasWithdrawn, "You have already withdrawn the funds for this vote");

        receipt.hasWithdrawn = true;
        removeFromUintArray(activeVotedProposals[msg.sender], pid);

        if (proposal.active)
            evaluateProposal(pid);

        IERC20(resolveSingleton(QUAD_TOKEN_ROLE)).transfer(msg.sender, receipt.voteAmount);
    }

    function getVoterReceipt(uint256 pid, address voter) external view returns (uint256 voteAmount, bool isFor, bool hasWithdrawn) {
        Receipt storage receipt = proposals[pid].voters[voter];

        return (receipt.voteAmount, receipt.isFor, receipt.hasWithdrawn);
    }

    function changeProposalLockBips(uint256 newBips) external onlyRoot {
        uint256 oldBips = proposalLockBips;
        proposalLockBips = newBips;

        emit ProposalLockBipsChanged(newBips, oldBips);
    }

    function removeFromUintArray(uint256[] storage arr, uint256 element) internal {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == element) {
                arr[i] = arr[arr.length - 1];
                delete arr[arr.length - 1];
            }

        }
    }

}