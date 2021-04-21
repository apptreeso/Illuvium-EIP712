// migrations/1_BNT.js
const BNT = artifacts.require("BNT");

module.exports = function(deployer) {
    deployer.then(function() {
        return deployer.deploy(BNT).then(BNT => {
            console.log("BNT is deployed at ", BNT.address);
        })
    });
}