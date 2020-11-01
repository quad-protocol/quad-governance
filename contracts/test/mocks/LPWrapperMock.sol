pragma solidity ^0.6.0;

contract LPWrapperMock {

    bool public toggleWrappableCalled;
    bool public isWrappable;

    function toggleWrappable(bool wrappable) public {
        toggleWrappableCalled = true;
        isWrappable = wrappable;
    }
}