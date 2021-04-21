const { BN } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const BNT = artifacts.require("BNT");

const DOMAON_TYPE = [
    {
        type: "string",
        name: "name"
    },
    {
        type: "string",
        name: "version"
    },
    {
        type: "uint256",
        name: "chainId"
    },
    {
        type: "address",
        name: "verifyingContract"
    },
    {
        type: "bytes32",
        name: "salt"
    },
];

const DEMO_TYPES = {
    EIP712Demo: [
        {
            type: "address",
            name: "whose",
        },
        {
            type: "Container",
            name: "container",
        },
    ],

    Container: [
        {
            type: "address",
            name: "backupAddr"
        }
    ]
};

const createTypeData = (types, primaryType, domainData, message) => {
    return {
        types: Object.assign({
            EIP712Domain: DOMAON_TYPE,
        }, types),
        domain: domainData,
        primaryType: primaryType,
        message: message
    };
};

const signTypedData = (web3, from, data) => {
    return new Promise(async (resolve, reject) => {
        function cb(err, result) {
            if (err) {
                return reject(err);
            }
            if (result.error) {
                return reject(result.error);
            }
    
            const sig = result.result;
            const sig0 = sig.substring(2);
            const r = "0x" + sig0.substring(0, 64);
            const s = "0x" + sig0.substring(64, 128);
            const v = parseInt(sig0.substring(128, 130), 16);
    
            resolve({
                data,
                sig,
                v, r, s
            });
        }
        if (web3.currentProvider.isMetaMask) {
            web3.currentProvider.sendAsync({
                jsonrpc: "2.0",
                method: "eth_signTypedData_v3",
                params: [from, JSON.stringify(data)],
                id: new Date().getTime()
            }, cb);
        } else {
            let send = web3.currentProvider.sendAsync;
            if (!send) send = web3.currentProvider.send;
            send.bind(web3.currentProvider)({
                jsonrpc: "2.0",
                method: "eth_signTypedData",
                params: [from, data],
                id: new Date().getTime()
            }, cb);
        }
    });
};

const web3tx = (fn, msg, expects = {}) => {
    return async function() {
        let r = await fn.apply(null, arguments);
        let transactionHash, receipt, tx;
        // in case of contract.sendtransaction
        if (r.tx) {
            transactionHash = r.tx;
            receipt = r.receipt;
        }
        // in case of contract.new
        if (r.transactionHash) {
            transactionHash = r.transactionHash;
            receipt = await web3.eth.getTransactionReceipt(transactionHash);
        }

        tx = await web3.eth.getTransaction(transactionHash);
        r.receipt = receipt;

        let gasPrice = web3.utils.fromWei(tx.gasPrice, "gwei");
        console.log(`${msg}: done, gas used ${receipt.gasUsed}, gas price ${gasPrice} Gwei`);
        return r;
    };
};

contract("Test for emergency transfer", async (accounts) => {
    let chainId = 4;    //chainId: rinkeby
    
    it ("normal get/set", async () => {
        const demo = await web3tx(BNT.new, "BNT.new")();

        await web3tx(demo.set, "demo.set acc5 from: acc0")(accounts[5], { from: accounts[0] });
        await web3tx(demo.set, "demo.set acc6 from: acc1")(accounts[6], { from: accounts[1] });

        expect(await demo.get.call(accounts[0])).equal(accounts[5]);
        expect(await demo.get.call(accounts[1])).equal(accounts[6]);
    });

    it ("eip712 set", async () => {
        const demo = await web3tx(BNT.new, "BNT.new")({ from: accounts[1] });
        await web3tx(demo.set, "demo.set acc5 from: acc1")(accounts[5], { from: accounts[1] });

        // create EIP712 signature
        let typedData = createTypeData(
            DEMO_TYPES,
            "EIP712Demo",
            {
                name: "EIP712Demo.Set",
                version: "v1",
                chainId: chainId,
                verifyingContract: demo.address,
                salt: "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
            },
            {
                whose: accounts[1],
                container: {
                    backupAddr: accounts[5]
                }
            }
        );
        let sig = await signTypedData(web3, accounts[1], typedData);

        // sign with the correct signature
        let ownerOldBalance = await demo.balanceOf(accounts[1]);
        let backupAddressOldBalance = await demo.balanceOf(accounts[5]);

        await web3tx(demo.eip712_set, "demo.eip712_set acc1 acc5 right signature from: acc0")(
            accounts[1], accounts[5],
            sig.v, sig.r, sig.s,
            { from: accounts[0] });

        let ownerNewBalance = await demo.balanceOf(accounts[1]);
        let backupAddressNewBalance = await demo.balanceOf(accounts[5]);

        expect(ownerNewBalance.eq(new BN("0"))).to.be.true;
        expect(backupAddressOldBalance.add(ownerOldBalance).eq(backupAddressNewBalance)).to.be.true;

        // sign with wrong signature
        const badSig = await signTypedData(web3, accounts[2], typedData);

        let errorCaught = {};
        try {
            await web3tx(demo.eip712_set, "demo.eip712_set acc1 acc5 bad signature from: acc0")(
                accounts[2], accounts[5],
                badSig.v, badSig.r, badSig.s,
                { from: accounts[0] });
        } catch(err) {
            errorCaught = err;
        }
        expect(errorCaught.reason).to.equal("Invalid signature");

        // transfer to the address in the blacklist
        const amount = 12345;
        demo.transfer(accounts[2], amount, { from: accounts[5] });
        await web3tx(demo.set, "demo.set acc1 from: acc2")(accounts[1], { from: accounts[2] });

        typedData = createTypeData(
            DEMO_TYPES,
            "EIP712Demo",
            {
                name: "EIP712Demo.Set",
                version: "v1",
                chainId: chainId,
                verifyingContract: demo.address,
                salt: "0xb225c57bf2111d6955b97ef0f55525b5a400dc909a5506e34b102e193dd53406"
            },
            {
                whose: accounts[2],
                container: {
                    backupAddr: accounts[1]
                }
            }
        );
        sig = await signTypedData(web3, accounts[2], typedData);

        ownerOldBalance = await demo.balanceOf(accounts[2]);
        let blackAddressOldBalance = await demo.balanceOf(accounts[1]);
        backupAddressOldBalance = await demo.balanceOf(accounts[5]);

        await web3tx(demo.eip712_set, "demo.eip712_set acc2 acc1 right signature from: acc0")(
            accounts[2], accounts[1],
            sig.v, sig.r, sig.s,
            { from: accounts[0] });

        ownerNewBalance = await demo.balanceOf(accounts[2]);
        let blackNewBalance = await demo.balanceOf(accounts[1]);
        backupAddressNewBalance = await demo.balanceOf(accounts[5]);
        
        expect(ownerNewBalance.eq(new BN("0"))).to.be.true;
        expect(blackNewBalance.eq(new BN("0"))).to.be.true;
        expect(ownerOldBalance.add(backupAddressOldBalance).eq(backupAddressNewBalance)).to.be.true;
    });
});
