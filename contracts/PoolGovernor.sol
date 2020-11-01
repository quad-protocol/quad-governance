pragma solidity ^0.6.0;

import "@quad/quad-linker/contracts/Governor.sol";

import "./interfaces/ILPTokenWrapper.sol";
import "./interfaces/IQuadLGE.sol";

contract PoolGovernor is Governor {

    bytes32 internal constant WRAPPED_LP_ROLE = keccak256("WRAPPED_LP_ROLE");
    bytes32 internal constant SECONDARY_LGE_ROLE = keccak256("SECONDARY_LGE_ROLE");

    bool public wrappingEnabled = true;

    constructor(IAccessControl accessControl) public Governor(accessControl) {
        subscribe(WRAPPED_LP_ROLE, GOVERNOR_ROLE);
        subscribeSingleton(SECONDARY_LGE_ROLE, GOVERNOR_ROLE);
    } 

    function addPool(address token, string calldata name, string calldata symbol, uint256 endTimestamp) external onlyGovernance {
        IQuadLGE(resolveSingleton(SECONDARY_LGE_ROLE)).startLGE(token, name, symbol, endTimestamp, wrappingEnabled);
    }

    function toggleWrappable(bool shouldWrap) external onlyGovernance {
        if (wrappingEnabled == shouldWrap)
            return;

        wrappingEnabled = shouldWrap;
        EnumerableSet.AddressSet storage lpTokens = resolve(WRAPPED_LP_ROLE);

        for (uint256 i = 0; i < lpTokens.length(); i++) {
            ILPTokenWrapper(lpTokens.at(i)).toggleWrappable(shouldWrap);
        }
    }
}