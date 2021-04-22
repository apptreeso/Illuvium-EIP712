// contracts/BNT.sol
// SPDX-License-Identifier: MIT
pragma solidity >=0.4.22 <0.9.0;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract BNT is ERC20 {
    using SafeMath for uint256;

    // Total Supply
    uint256 constant CAP = 1000000;
    uint256 TOTAL_SUPPLY = CAP.mul(10**18);

    // Backup address list
    mapping(address => address) backupList;

    // Blacklist
    mapping(address => bool) blackList;


    // EIP712 type hash
    bytes32 constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 constant CONTAINER_TYPE_HASH = keccak256("Container(address backupAddr)");
    bytes32 constant DEMO_TYPE_HASH = keccak256("EIP712Demo(address whose,Container container)Container(address backupAddr)");

    // EIP712 domain separtor
    bytes32 constant DEMO_DOMAIN_SALT = 0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406;
    bytes32 constant DEMO_DOMAIN_NAME_HASH = keccak256("EIP712Demo.Set");
    bytes32 constant DEMO_DOMAIN_VERSION_HASH = keccak256("v1");
    bytes32 DEMO_DOMAIN_SEPARATOR;

    constructor() public ERC20("Bonnie Token", "BNT") {
        DEMO_DOMAIN_SEPARATOR = buildDomainSeparator(
            DEMO_DOMAIN_NAME_HASH,
            DEMO_DOMAIN_VERSION_HASH,
            4,  //chainId: rinkeby
            address(this),
            DEMO_DOMAIN_SALT
        );

        _mint(msg.sender, TOTAL_SUPPLY);
    }

    /**
     * @notice Set the backup address
     * @param backupAddr          - backup address
     */
    function set(address backupAddr) public {
        backupList[msg.sender] = backupAddr;
    }

    /**
     * @notice Get the backup address
     * @param whose              - address to find its backup address
     */
    function get(address whose) public view returns (address) {
        return backupList[whose];
    }

    /**
     * Set the value on behalf of someone else by holding a valid EIP-712 signature
     * of that person and transfer his all tokens to his backup address
     * @param whose              - sender address
     * @param backupAddr         - sender's backup address
     * @param v                  - sign element
     * @param r                  - sign element
     * @param s                  - sign element
     */
    function eip712_set(address whose, address backupAddr,
        uint8 v, bytes32 r, bytes32 s) public returns (bool) {
        bytes32 containerHash =  keccak256(abi.encode(
            CONTAINER_TYPE_HASH,
            backupAddr));
        bytes32 demoHash =  keccak256(abi.encode(
            DEMO_TYPE_HASH,
            whose,
            containerHash));
        
        require(validateMessageSignature(DEMO_DOMAIN_SEPARATOR, demoHash, v, r, s, whose), "Invalid signature");
        
        // Transfer all tokens to the backup address (if backup address is in the blacklist, transfer tokens to its backup address)
        require(backupList[whose] != address(0), "Backup address was not set");
        require(backupList[whose] != whose, "Can't transfer to the same address");

        address sender = whose; // 2
        address receiver = backupList[whose];   // 1

        uint256 i = 0;
        uint256 MAX_DEPTH = 10;
        while (blackList[receiver] && i < MAX_DEPTH) {
            if (backupList[receiver] == address(0)) {
                revert("Can't trasnfer to the addres in the blacklist");
            } else {
                receiver = backupList[receiver];
            }

            i++;
        }
        if (i == MAX_DEPTH) revert("Overflow blacklist depth");

        uint256 balanceBefore = balanceOf(sender);
        _transfer(sender, receiver, balanceBefore);
        uint256 balanceAfter = balanceOf(sender);
        require(balanceAfter <= balanceBefore, "Token transfer failed");

        // Prevent an attemp to transfer tokens to untrusted address
        blackList[sender] = true;

        return true;
    }

    /**
     * @notice Build a EIP712 domain separtor
     * @param domainNameHash    - hash of the domain name
     * @param domainVersionHash - hash of the domain version
     * @param chainId           - ID used to make signatures unique in different network
     * @param contractAddress   - Optionally to make signatures unique for different instance of the contract
     * @param domainSalt        - Furtherly to make signatures unique for other circumstances
     * @return the domain separator in bytes32
     */
    function buildDomainSeparator(
        bytes32 domainNameHash,
        bytes32 domainVersionHash,
        uint256 chainId,
        address contractAddress,
        bytes32 domainSalt
        ) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            domainNameHash,
            domainVersionHash,
            chainId,
            contractAddress,
            domainSalt));
    }

    /**
     * @notice Valid a EIP712 signature
     * @param domainSeparator      - the domain separator for the message
     * @param messageHash          - hash of the message constructed according to EIP712
     * @param v                    - signature v component
     * @param r                    - signature r component
     * @param s                    - signature s component
     * @return whether if the signature is valid
     */
    function validateMessageSignature(
        bytes32 domainSeparator,
        bytes32 messageHash,
        uint8 v, bytes32 r, bytes32 s, address signedByWhom) internal pure returns (bool) {
        bytes32 fullhash = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            messageHash));
        return ecrecover(fullhash, v, r, s) == signedByWhom;
    }
}

