pragma solidity ^0.6.0;

import "@openzeppelin/contracts/math/SafeMath.sol";

contract QuadVaultMock {

    using SafeMath for uint256;

    mapping(address => mapping(address => uint256)) public lockedTokens;
    mapping(address => mapping(address => uint256)) public balances;

    bool public autoMock = true;

    function lockTokens(address target, address token, uint256 amount) external {
        if (autoMock && balances[target][token].sub(lockedTokens[target][token]) < amount)
            balances[target][token] = balances[target][token].add(amount);

        require(balances[target][token].sub(lockedTokens[target][token]) >= amount, "Insufficient unlocked balance");

        lockedTokens[target][token] = lockedTokens[target][token].add(amount);
    }

    function unlockTokens(address target, address token, uint256 amount) external {
        require(lockedTokens[target][token] >= amount, "Insufficient unlocked balance");

        lockedTokens[target][token] = lockedTokens[target][token].sub(amount);
    }

    function deposit(address target, address token, uint256 amount) external {
        balances[target][token] = balances[target][token].add(amount);
    }

    function shouldAutoMock(bool _auto) external {
        autoMock = _auto;
    }

}