pragma solidity ^0.6.0;

import "@quad/quad-linker/contracts/RemoteAccessControl.sol";

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

abstract contract SharedGovernance is RemoteAccessControl {

    using EnumerableSet for EnumerableSet.AddressSet;

    struct GovernorRequirements {
        uint256 quorumBips;
        uint256 majorityBips;
    }

    enum DenyReason {
        quorum, majority
    }

    bytes32 internal constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 internal constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");
    bytes32 internal constant QUAD_CHAMBER_ROLE = keccak256("QUAD_CHAMBER_ROLE");
    bytes32 internal constant LP_CHAMBER_ROLE = keccak256("LP_CHAMBER_ROLE");

    uint256 public proposalsDeadline;

    GovernorRequirements internal defaultGovernorRequirements;

    mapping(address => GovernorRequirements) internal overriddenGovernors;

    constructor(uint256 defaultQuorumBips, uint256 defaultMajorityBips, uint256 defaultProposalsDeadline, 
        IAccessControl accessControl) public RemoteAccessControl(GOVERNANCE_ROLE, false, accessControl) {
        require(defaultMajorityBips > 0, "Cannot have a 0 bips majority");
        proposalsDeadline = defaultProposalsDeadline;
        defaultGovernorRequirements.quorumBips = defaultQuorumBips;
        defaultGovernorRequirements.majorityBips = defaultMajorityBips;

        subscribe(GOVERNOR_ROLE, GOVERNANCE_ROLE);
    }

    event NewProposal(uint256 indexed pid, address indexed targetGovernor, bytes indexed data, uint256 quorum, uint256 majorityByps, uint256 deadline);
    event ProposalApproved(uint256 indexed pid, uint256 totalVotes, uint256 votesInFavor, uint256 votesAgainst);
    event ProposalDenied(uint256 indexed pid, uint256 totalVotes, uint256 votesInFavor, uint256 votesAgainst, DenyReason denyReason);

    event ProposalsDeadlineChanged(uint256 indexed newDeadline, uint256 indexed oldDeadline);

    modifier onlyGovernor() {
        require(isGovernor(msg.sender), "Sender isn't a governor");
        _;
    }

    function isGovernor(address addr) internal view returns (bool) {
        return hasRole(GOVERNOR_ROLE, addr);
    }

    function changeGovernorData(address governor, uint256 quorumBips, uint256 majorityBips) external onlyRoot {
        require(majorityBips > 0, "Cannot have a 0 bips majority");
        require(hasRole(GOVERNOR_ROLE, governor), "Address isn't a governor");

        overriddenGovernors[governor] = GovernorRequirements(
            quorumBips,
            majorityBips
        );
    }

    function restoreGovernorData(address governor) external onlyRoot {
        delete overriddenGovernors[governor];
    }

    function changeDefaultGovernorData(uint256 quorumBips, uint256 majorityBips) external onlyRoot {
        require(majorityBips > 0, "Cannot have a 0 bips majority");
        defaultGovernorRequirements.quorumBips = quorumBips;
        defaultGovernorRequirements.majorityBips = majorityBips;
    }

    function changeProposalsDeadline(uint256 newDeadline) external onlyGovernor {
        uint256 oldDeadline = proposalsDeadline;
        proposalsDeadline = newDeadline;

        emit ProposalsDeadlineChanged(newDeadline, oldDeadline);
    }

    function getGovernorData(address governor) public view returns (uint256 quorumBips, uint256 majorityBips) {
        require(isGovernor(governor), "Address isn't a governor");

        GovernorRequirements storage overriddenRequirements = overriddenGovernors[governor];
        if (overriddenRequirements.majorityBips > 0)
            return (overriddenRequirements.quorumBips, overriddenRequirements.majorityBips);

        return (defaultGovernorRequirements.quorumBips, defaultGovernorRequirements.majorityBips);
    }

    function evaluateProposal(uint256 pid) public virtual;

    function withdraw(uint256 pid) external virtual;

}