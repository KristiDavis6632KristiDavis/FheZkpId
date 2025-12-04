// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateIdentitySystem is SepoliaConfig {
    // Struct for encrypted identity attributes
    struct EncryptedIdentity {
        euint32 encryptedAge;
        euint32 encryptedCreditScore;
        euint32 encryptedNationality;
        bool isInitialized;
    }
    
    // Struct for ZKP verification results
    struct ProofVerification {
        bool ageVerified;
        bool creditVerified;
        bool nationalityVerified;
        uint256 timestamp;
    }

    // Contract state variables
    mapping(address => EncryptedIdentity) private encryptedIdentities;
    mapping(address => ProofVerification) public proofVerifications;
    
    // ZKP verification counters
    euint32 private verifiedAgeCount;
    euint32 private verifiedCreditCount;
    euint32 private verifiedNationalityCount;
    
    // Request tracking for decryption
    mapping(uint256 => address) private requestToAddress;
    mapping(uint256 => string) private requestToProofType;
    
    // Events
    event IdentityRegistered(address indexed user);
    attributeVerificationRequested(address indexed user, string proofType);
    attributeVerified(address indexed user, string proofType);

    /// @dev Modifier to check if identity exists
    modifier identityExists(address user) {
        require(encryptedIdentities[user].isInitialized, "Identity not found");
        _;
    }

    /// @notice Register encrypted identity attributes
    function registerIdentity(
        euint32 encryptedAge,
        euint32 encryptedCreditScore,
        euint32 encryptedNationality
    ) public {
        require(!encryptedIdentities[msg.sender].isInitialized, "Already registered");
        
        encryptedIdentities[msg.sender] = EncryptedIdentity({
            encryptedAge: encryptedAge,
            encryptedCreditScore: encryptedCreditScore,
            encryptedNationality: encryptedNationality,
            isInitialized: true
        });
        
        emit IdentityRegistered(msg.sender);
    }

    /// @notice Request ZKP verification for an attribute
    function requestAttributeVerification(
        string memory proofType
    ) public identityExists(msg.sender) {
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("age"))) {
            ciphertexts[0] = FHE.toBytes32(encryptedIdentities[msg.sender].encryptedAge);
        } else if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("credit"))) {
            ciphertexts[0] = FHE.toBytes32(encryptedIdentities[msg.sender].encryptedCreditScore);
        } else if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("nationality"))) {
            ciphertexts[0] = FHE.toBytes32(encryptedIdentities[msg.sender].encryptedNationality);
        } else {
            revert("Invalid proof type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.verifyAttributeProof.selector);
        requestToAddress[reqId] = msg.sender;
        requestToProofType[reqId] = proofType;
        
        emit attributeVerificationRequested(msg.sender, proofType);
    }

    /// @notice Callback for ZKP verification
    function verifyAttributeProof(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        address user = requestToAddress[requestId];
        string memory proofType = requestToProofType[requestId];
        require(user != address(0), "Invalid request");
        
        // Verify ZKP signature
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Update verification status
        if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("age"))) {
            proofVerifications[user].ageVerified = true;
            verifiedAgeCount = FHE.add(verifiedAgeCount, FHE.asEuint32(1));
        } else if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("credit"))) {
            proofVerifications[user].creditVerified = true;
            verifiedCreditCount = FHE.add(verifiedCreditCount, FHE.asEuint32(1));
        } else if (keccak256(abi.encodePacked(proofType)) == keccak256(abi.encodePacked("nationality"))) {
            proofVerifications[user].nationalityVerified = true;
            verifiedNationalityCount = FHE.add(verifiedNationalityCount, FHE.asEuint32(1));
        }
        
        proofVerifications[user].timestamp = block.timestamp;
        emit attributeVerified(user, proofType);
    }

    /// @notice Perform FHE computation on identity attributes
    function computeIdentityCheck(
        address user,
        euint32 requiredAge,
        euint32 requiredCredit
    ) public view identityExists(user) returns (ebool) {
        EncryptedIdentity storage identity = encryptedIdentities[user];
        
        ebool ageCheck = FHE.ge(identity.encryptedAge, requiredAge);
        ebool creditCheck = FHE.ge(identity.encryptedCreditScore, requiredCredit);
        
        return FHE.and(ageCheck, creditCheck);
    }

    /// @notice Get verification status
    function getVerificationStatus(
        address user
    ) public view returns (bool ageVerified, bool creditVerified, bool nationalityVerified, uint256 timestamp) {
        ProofVerification storage verification = proofVerifications[user];
        return (
            verification.ageVerified,
            verification.creditVerified,
            verification.nationalityVerified,
            verification.timestamp
        );
    }

    /// @notice Get encrypted verification counters
    function getEncryptedVerificationCounts() public view returns (
        euint32 ageCount,
        euint32 creditCount,
        euint32 nationalityCount
    ) {
        return (verifiedAgeCount, verifiedCreditCount, verifiedNationalityCount);
    }
}