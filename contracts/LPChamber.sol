pragma solidity ^0.6.0;

import "./SharedGovernance.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IQuadVault.sol";

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract LPChamber is SharedGovernance {

    using Address for address;
    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Proposal {
        bool active;
        address proposer;
        address governor;
        bytes data;
        uint256 quorumBips;
        uint256 majorityBips;
        uint256 deadline;
        string description;
        mapping(address => uint256) forVotes;
        mapping(address => uint256) againstVotes;
        mapping(address => Receipt) voters;
    }

    struct Receipt {
        bool hasVoted;
        bool isFor;
        bool hasWithdrawn;
        mapping(address => uint256) deposits;
    }

    bytes32 internal constant WRAPPED_LP_ROLE = keccak256("WRAPPED_LP_ROLE");
    bytes32 internal constant QUAD_VAULT_ROLE = keccak256("QUAD_VAULT_ROLE");

    uint256 public totalProposals;

    uint256 constant public POINTS_MULTIPLIER = 2 ** 128;

    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256[]) public votedProposals;
    mapping(address => uint256[]) public activeVotedProposals;
    mapping(address => uint256[]) public proposers;

    constructor(uint256 defaultQuorumBips, uint256 defaultMajorityBips, uint256 defaultProposalsDeadline, IAccessControl accessControl) 
                public SharedGovernance(defaultQuorumBips, defaultMajorityBips, defaultProposalsDeadline, accessControl) {
        requestRole(LP_CHAMBER_ROLE, address(this), true);
        subscribeSingleton(QUAD_CHAMBER_ROLE, LP_CHAMBER_ROLE);
        subscribeSingleton(QUAD_VAULT_ROLE, LP_CHAMBER_ROLE);
        subscribe(WRAPPED_LP_ROLE, LP_CHAMBER_ROLE);
    }

    event VoteCasted(address indexed voter, uint256 indexed pid, bool isFor);

    function newProposal(address targetGovernor, bytes calldata data, address proposer, string calldata description) external {
        require(hasRole(QUAD_CHAMBER_ROLE, msg.sender), "Sender isn't the quad chamber");
        (uint256 quorumBips, uint256 majorityBips) = getGovernorData(targetGovernor);

        proposals[totalProposals] = Proposal(
            true,
            proposer,
            targetGovernor,
            data,
            quorumBips,
            majorityBips,
            now.add(proposalsDeadline),
            description
        );

        proposers[proposer].push(totalProposals);

        emit NewProposal(totalProposals, targetGovernor, data, quorumBips, majorityBips, now.add(proposalsDeadline));

        totalProposals++;
    }

    function vote(uint256 pid, uint256 tokenAmount, bool isFor, address voteToken) external {
        require(hasRole(WRAPPED_LP_ROLE, voteToken), "Invalid token");

        Proposal storage proposal = proposals[pid];
        require(proposal.active && proposal.deadline > now, "Proposal is inactive");
        address vault = resolveSingleton(QUAD_VAULT_ROLE);

        IQuadVault(vault).lockTokens(msg.sender, voteToken, tokenAmount);

        Receipt storage receipt = proposal.voters[msg.sender];
        if (receipt.hasVoted)
            require(receipt.isFor == isFor, "Cannot change vote");
        else {
            receipt.isFor = isFor;
            receipt.hasVoted = true;
            activeVotedProposals[msg.sender].push(pid);
            votedProposals[msg.sender].push(pid);

            emit VoteCasted(msg.sender, pid, isFor);
        }

        receipt.deposits[voteToken] = receipt.deposits[voteToken].add(tokenAmount);

        if (isFor) 
            proposal.forVotes[voteToken] = proposal.forVotes[voteToken].add(tokenAmount);
        else
            proposal.againstVotes[voteToken] = proposal.againstVotes[voteToken].add(tokenAmount);
    }

    function withdraw(uint256 pid) external override {
        Proposal storage proposal = proposals[pid];

        require(now >= proposal.deadline, "Voting still ongoing");

        Receipt storage receipt = proposal.voters[msg.sender];
        require(receipt.hasVoted, "You haven't voted for this proposal");
        require(!receipt.hasWithdrawn, "You have already withdrawn the funds for this vote");

        receipt.hasWithdrawn = true;
        removeFromUintArray(activeVotedProposals[msg.sender], pid);

        if (proposal.active)
            evaluateProposal(pid);

        EnumerableSet.AddressSet storage tokens = resolve(WRAPPED_LP_ROLE);

        for (uint256 i = 0; i < tokens.length(); i++) {
            address token = tokens.at(i);
            uint256 depositAmount = receipt.deposits[token];

            if (depositAmount > 0) {
                IQuadVault(resolveSingleton(QUAD_VAULT_ROLE)).unlockTokens(msg.sender, token, depositAmount);
            }
        }
    }

    function evaluateProposal(uint256 pid) public override {
        Proposal storage proposal = proposals[pid];

        require(now >= proposal.deadline, "Voting still ongoing");
        require(proposal.active, "Proposal is inactive");

        proposal.active = false;
        (uint256 forVotes, uint256 againstVotes) = calculatePoints(proposal);
        uint256 totalVotes = forVotes.add(againstVotes);

        if (totalVotes < proposal.quorumBips.mul(POINTS_MULTIPLIER).div(10000)) {
            emit ProposalDenied(pid, totalVotes, forVotes, againstVotes, DenyReason.quorum);
            return;
        }

        if (totalVotes.mul(proposal.majorityBips).div(10000) > forVotes) {
            emit ProposalDenied(pid, totalVotes, forVotes, againstVotes, DenyReason.majority);
            return;
        }

        emit ProposalApproved(pid, totalVotes, forVotes, againstVotes);

        proposal.governor.functionCall(proposal.data);
    }

    function getVoterReceipt(uint256 pid, address voter) external view returns (bool hasVoted, bool isFor, bool hasWithdrawn, address[] memory tokens, uint256[] memory depositedAmounts) {
        Receipt storage receipt = proposals[pid].voters[voter];

        hasVoted = receipt.hasVoted;
        isFor = receipt.isFor;
        hasWithdrawn = receipt.hasWithdrawn;

        EnumerableSet.AddressSet storage set = resolve(WRAPPED_LP_ROLE);
        tokens = new address[](set.length());
        depositedAmounts = new uint256[](tokens.length);

        for (uint256 i = 0; i < set.length(); i++) {
            address token = set.at(i);
            tokens[i] = token;
            depositedAmounts[i] = receipt.deposits[token];
        }
    }

    function getProposalVotes(uint256 pid) external view returns (address[] memory tokens, uint256[] memory forVotes, uint256[] memory againstVotes) {
        Proposal storage proposal = proposals[pid];

        EnumerableSet.AddressSet storage set = resolve(WRAPPED_LP_ROLE);
        tokens = new address[](set.length());
        forVotes = new uint256[](tokens.length);
        againstVotes = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = set.at(i);
            tokens[i] = token;
            forVotes[i] = proposal.forVotes[token];
            againstVotes[i] = proposal.againstVotes[token];
        }
    }

    function calculatePoints(Proposal storage proposal) internal view returns (uint256 forPoints, uint256 againstPoints) {
        EnumerableSet.AddressSet storage tokens = resolve(WRAPPED_LP_ROLE);
        for (uint256 i = 0; i < tokens.length(); i++) {
            address token = tokens.at(i);
            uint256 totalSupply = IERC20(token).totalSupply();
            
            forPoints = forPoints.add(proposal.forVotes[token].mul(POINTS_MULTIPLIER).div(totalSupply));
            againstPoints = againstPoints.add(proposal.againstVotes[token].mul(POINTS_MULTIPLIER).div(totalSupply));
        }
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