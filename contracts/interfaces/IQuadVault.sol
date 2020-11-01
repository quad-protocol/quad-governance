pragma solidity ^0.6.0;

interface IQuadVault {

    event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
    event Withdrawal(address indexed user, uint256 indexed pid, uint256 amount);
    event EmergencyWithdrawal(address indexed user, uint256 indexed pid);

    event PoolAdded(uint256 indexed pid, address indexed poolToken);
    event PoolPointsChanged(uint256 indexed pid, uint256 newPoints, uint256 oldPoints);

    event GovernanceChanged(address indexed newGovernance, address indexed oldGovernance);

    function init(address quadToken, address feeCollector, address owner) external;

    function poolLength() external view returns (uint256);

    function addPool(uint256 poolPoints, address token) external;

    function changePoolPoints(uint256 pid, uint256 newPoints) external;

    function pendingRewards(uint256 pid, address addr) external view returns (uint256);

    function massUpdatePools() external;

    function deposit(uint256 pid, uint256 amount) external;

    function withdraw(uint256 pid, uint256 amount) external;

    function emergencyWithdraw(uint256 pid) external;

    function lockTokens(address target, address token, uint256 amount) external;
    function unlockTokens(address target, address token, uint256 amount) external;

    function changeGovernanceAddress(address addr) external;
}