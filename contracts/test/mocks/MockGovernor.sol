pragma solidity ^0.6.0;

contract MockGovernor {

    bool public argFunctionCalled;
    bool public noArgFunctionCalled;

    uint256 public arg1;
    address public arg2;

    function mockFunctionWithArgs(uint256 _arg1, address _arg2) external {
        argFunctionCalled = true;
        arg1 = _arg1;
        arg2 = _arg2;
    }

    function mockFunctionNoArgs() external {
        noArgFunctionCalled = true;
    }

}