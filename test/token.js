import ether from './helpers/ether'
import {advanceBlock} from './helpers/advanceToBlock'
import {increaseTimeTo, duration} from './helpers/increaseTime'
import latestTime from './helpers/latestTime'
import EVMRevert from './helpers/EVMRevert'
import EVMThrow from './helpers/EVMThrow'

// web3Abi required to test overloaded transfer functions
const web3Abi = require('web3-eth-abi');

// BigNumber is used for handling gwei vars
const BigNumber = web3.BigNumber

// Chai gives you a very nice, straight forward and clean assertion checking mechanisms
const should = require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

// Contract constants
const Token               = artifacts.require('../contracts/CoinvestToken')
const ICO                 = artifacts.require('../contracts/ICO')
const TestContract        = artifacts.require('../contracts/TestContract')


// Promisify get balance of ether
const promisify = (inner) =>
  new Promise((resolve, reject) =>
    inner((err, res) => {
      if (err) { reject(err) }
      resolve(res);
    })
  );

const getBalance = (account, at) =>
  promisify(cb => web3.eth.getBalance(account, at, cb));

const overloadedTransferAbi = {"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"},{"name":"_data","type":"bytes"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"};

const overloadedTransferCustomFallbackAbi = {"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"},{"name":"_data","type":"bytes"},{"name":"_custom_fallback","type":"string"}],"name":"transfer","outputs":[{"name":"success","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"};

// Create Koth Contract
contract('Token', function ([_, wallet]) {

  before(async function() {
    //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
    await advanceBlock()

    this.owner             = web3.eth.accounts[0];
    this.accountTwo        = web3.eth.accounts[1];
    this.accountThree      = web3.eth.accounts[2];
    this.accountFour       = web3.eth.accounts[3];

    this.totalBalance      = 107142857;

    this.tokenContract      = await Token.new({from: this.owner});
    this.testContract       = await TestContract.new({from: this.owner});

    this.web3               = this.tokenContract.web3;

  })

  describe('ERC20 Functionality', function () { 

    it('owner should be maintainer and have entire token balance', async function () {

      let address = await this.tokenContract.maintainer.call()
      address.should.be.equal(this.owner)

      let balance = await this.tokenContract.balanceOf(this.owner)
      balance.should.be.bignumber.equal(toEther(this.totalBalance))

    })

    it('send 1000 tokens from owner to *test contract*', async function () {

      let tx = await this.tokenContract.transfer(this.testContract.address, toEther(1000), {from: this.owner})
      assert.isOk(tx)

      let balance = await this.tokenContract.balanceOf(this.testContract.address)
      balance.should.be.bignumber.equal(toEther(1000))

    })

    it('owner should transfer (no data) 1000 coins to accountTwo', async function () {

      let tx = await this.tokenContract.transfer(this.accountTwo, toEther(1000), {from: this.owner})
      assert.isOk(tx)

      let balance = await this.tokenContract.balanceOf(this.accountTwo)
      balance.should.be.bignumber.equal(toEther(1000))

    })

    it('accountTwo should transfer 1000 coins to accountThree with ERC20Transfer', async function () {

      let tx = await this.tokenContract.ERC20transfer(this.accountThree, toEther(1000), 0, {from: this.accountTwo})
      assert.isOk(tx)

      let balance = await this.tokenContract.balanceOf(this.accountThree)
      balance.should.be.bignumber.equal(toEther(1000))

    })

    it('transfer should fail when accountTwo sends tokens it doesnt have', async function () {

      await this.tokenContract.transfer(this.accountThree, toEther(1000), {from: this.accountTwo}).should.be.rejectedWith(EVMRevert);

    })
    
    it('owner should approve 500 tokens to be sent by accountTwo', async function() {
    
      let tx = await this.tokenContract.approve(this.accountTwo, toEther(500), {from: this.owner})
      assert.isOk(tx)

      let allowance = await this.tokenContract.allowance(this.owner, this.accountTwo)
      allowance.should.be.bignumber.equal(toEther(500))

    })

    it('accountTwo should transfer 500 tokens on behalf of owner to accountFour', async function() {
    
      let tx = await this.tokenContract.transferFrom(this.owner, this.accountFour, toEther(500), {from: this.accountTwo})
      assert.isOk(tx)

      let allowance = await this.tokenContract.allowance(this.owner, this.accountTwo)
      allowance.should.be.bignumber.equal(0)

      let balance = await this.tokenContract.balanceOf(this.accountFour)
      balance.should.be.bignumber.equal(toEther(500))

    })

    it('accountTwo should fail to approve tokens it doesnt have', async function() {
    
      await this.tokenContract.approve(this.accountThree, toEther(5000), {from: this.accountTwo}).should.be.rejectedWith(EVMRevert);

    })

    it('accountTwo should fail to transferFrom tokens its not allowed to', async function() {
    
      await this.tokenContract.transferFrom(this.owner, this.accountTwo, toEther(5000), {from: this.accountTwo}).should.be.rejectedWith(EVMRevert);

    })

  })

  describe('ERC223 Functionality', function () { 

    it('owner should transfer (with data) 1000 coins to accountTwo', async function () {

      const transferMethodTransactionData = web3Abi.encodeFunctionCall(
          overloadedTransferAbi,
          [
              this.accountTwo,
              toEther(1000),
              '0x00'
          ]
      );
      
      await web3.eth.sendTransaction({from: this.owner, to: this.tokenContract.address, data: transferMethodTransactionData, value: 0});
      
      let balance = await this.tokenContract.balanceOf(this.accountTwo)
      balance.should.be.bignumber.equal(toEther(1000))

    })

    it('owner should transfer (with data) 1000 coins to *test contract*', async function () {

      const transferMethodTransactionData = web3Abi.encodeFunctionCall(
          overloadedTransferAbi,
          [
              this.testContract.address,
              toEther(1000),
              '0x00'
          ]
      );
      
      await web3.eth.sendTransaction({from: this.owner, to: this.tokenContract.address, data: transferMethodTransactionData, value: 0});
      
      let balance = await this.tokenContract.balanceOf(this.testContract.address)
      balance.should.be.bignumber.equal(toEther(2000))

    })

    it('owner should transfer (with data) 1000 coins to *test contract* with custom fallback', async function () {

      const transferMethodTransactionData = web3Abi.encodeFunctionCall(
          overloadedTransferCustomFallbackAbi,
          [
              this.testContract.address,
              toEther(1000),
              '0x1003ac0c',
              "customFallback(address,uint256,bytes)"
          ]
      );
      
      await web3.eth.sendTransaction({from: this.owner, to: this.tokenContract.address, data: transferMethodTransactionData, value: 0});
      
      let balance = await this.tokenContract.balanceOf(this.testContract.address)
      balance.should.be.bignumber.equal(toEther(3000))

    })

    it('custom fallback should fail', async function () {

      const badCallbackData = web3Abi.encodeFunctionCall(
          overloadedTransferCustomFallbackAbi,
          [
              this.testContract.address,
              toEther(2000),
              '0x00',
              "badCallback()"
          ]
      );
      
      await web3.eth.sendTransaction({from: this.owner, to: this.tokenContract.address, data: badCallbackData, value: 0});

    })

    it('accountTwo tries to transfer (with data) tokens it doesnt have', async function () {

      const transferMethodTransactionData = web3Abi.encodeFunctionCall(
          overloadedTransferAbi,
          [
              this.accountThree,
              toEther(5000),
              '0x00'
          ]
      );
      
      let tx = await web3.eth.sendTransaction({from: this.accountTwo, to: this.tokenContract.address, data: transferMethodTransactionData, value: 0})

      assert.isOk(tx)
      
    })

  })

  describe('Maintainer Functions', function () { 

    it('adjust transfer to erc223 (true and false checked)', async function () {

      this.tokenContract.adjust_ERC223Transfer(true, {from: this.owner})
      let value = await this.tokenContract.ERC223Transfer_enabled.call()
      value.should.be.equal(true)

      this.tokenContract.adjust_ERC223Transfer(false, {from: this.owner})
      value = await this.tokenContract.ERC223Transfer_enabled.call()
      value.should.be.equal(false)

    })

    it('adjust transfer no data (true and false checked)', async function () {

      this.tokenContract.adjust_Transfer_nodata(true, {from: this.owner})
      let value = await this.tokenContract.Transfer_nodata_enabled.call()
      value.should.be.equal(true)

      this.tokenContract.adjust_Transfer_nodata(false, {from: this.owner})
      value = await this.tokenContract.Transfer_nodata_enabled.call()
      value.should.be.equal(false)

    })

    it('adjust transfer data (true and false checked)', async function () {

      this.tokenContract.adjust_Transfer_data(true, {from: this.owner})
      let value = await this.tokenContract.Transfer_data_enabled.call()
      value.should.be.equal(true)

      this.tokenContract.adjust_Transfer_data(false, {from: this.owner})
      value = await this.tokenContract.Transfer_data_enabled.call()
      value.should.be.equal(false)

    })

    it('should fail when adjusting transfer data from non maintainer', async function () {

      this.tokenContract.adjust_Transfer_data(true, {from: this.accountTwo}).should.be.rejectedWith(EVMThrow);

    })

  })

  function toEther(value) {
    return web3.toWei(value, "ether")
  }

})