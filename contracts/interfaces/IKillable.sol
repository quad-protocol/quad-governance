pragma solidity ^0.6.0;

interface IKillable {

    event Killed();
    event KillerChanged(address indexed newKiller, address indexed oldKiller);

    function kill() external;

    function isKilled() external view returns (bool);
}