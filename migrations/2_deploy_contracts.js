var Token = artifacts.require("./CoinvestToken.sol");
var ICO = artifacts.require("./ICO.sol");
var TestContract = artifacts.require("./TestContract.sol");

module.exports = function(deployer) {
  deployer.deploy(Token);
  deployer.deploy(ICO);
  deployer.deploy(TestContract);
};
