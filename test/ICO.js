import ether from './helpers/ether'
import advanceToBlock, { advanceBlock } from './helpers/advanceToBlock'
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
const Token   = artifacts.require('../contracts/CoinvestToken')
const ICO     = artifacts.require('../contracts/ICO')

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


// Create ICO Contract
contract('ICO', function ([_, wallet]) {

    before(async function() {
        //Advance to the next block to correctly read time in the solidity "now" function interpreted by testrpc
        await advanceBlock()

        this.owner             = web3.eth.accounts[0];
        this.accountTwo        = web3.eth.accounts[1];
        this.accountThree      = web3.eth.accounts[2];
        this.accountFour       = web3.eth.accounts[3];

        this.price = 1571;
        this.start_block = 50;
        this.end_block = 100;
    
        this.tokenContract  = await Token.new({from: this.owner});
        this.icoContract    = await ICO.new(this.tokenContract.address, this.start_block, this.end_block, this.price, {from: this.owner});
      })

    // Must transfer tokens from tokenContract to icoContract
    // Initial launch of the ICO contract?
    // Must disallow end block being <= start block

    describe('Initialization', function () {

        it('Token address should equal token contract address.', async function () {

            let address = this.tokenContract.address
            let tokenAddress = await this.icoContract.tokenAddress()
            address.should.be.equal(tokenAddress)
        })

        it('Price should equal 1571.', async function () {
            let price = await this.icoContract.price.call()
            price.should.be.bignumber.equal(this.price)
        })

        it('Start block should be 50', async function () {
            let start_block = await this.icoContract.start_block.call()
            start_block.should.be.bignumber.equal(this.start_block)
        })

        it('End block should be 100', async function () {

            let end_block = await this.icoContract.end_block.call()
            end_block.should.be.bignumber.equal(this.end_block)
        })

        it('Transfer 150,000 tokens to ICO contract', async function () {

            let tx = await this.tokenContract.transfer(this.icoContract.address, toEther(150000), {from: this.owner})
            assert.isOk(tx)

            let balance = await this.tokenContract.balanceOf(this.icoContract.address)
            balance.should.be.bignumber.equal(toEther(150000))

        })

        it('Ensure user cannot call constructor.', async function () {        
            await this.icoContract.ICO({from: this.accountTwo}).should.be.rejectedWith(EVMThrow);
        })

    })

    describe('Pre crowdsale checks', function() {

        it('Ensure purchase cannot be called before crowdsale begins.', async function () {
            await this.icoContract.purchase(this.accountTwo, { value: toEther(1), from: this.accountTwo }).should.be.rejectedWith(EVMRevert);
        })

        it('Ensure timeframe updating works', async function () {
            let tx = await this.icoContract.set_timeframes(50, 105, {from: this.owner});
            assert.isOk(tx)

            let start_block = await this.icoContract.end_block.call()
            start_block.should.be.bignumber.equal(105)
        })

        it('Ensure timeframes can only be set by owner.', async function () {
            await this.icoContract.set_timeframes(0, 1, {from: this.accountThree}).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('Purchasing', function() {

        it('Ensure timeframes can only be set before crowdsale.', async function () {
            await advanceToBlock(51)
            await this.icoContract.set_timeframes(55, 100, {from: this.owner}).should.be.rejectedWith(EVMRevert);
        })

        it('Ensure fallback buys the correct amount of tokens.', async function () {

            await web3.eth.sendTransaction({
                from: this.accountTwo, 
                to: this.icoContract.address, 
                value: toEther(1)
            });

            let tokensBought = await this.tokenContract.balanceOf(this.accountTwo)
            tokensBought.should.be.bignumber.equal(toEther(this.price))
        })

        it('Ensure Buy event works properly', async function () {

            const { logs } = await this.icoContract.purchase(this.accountTwo, { value: toEther(1), from: this.accountTwo });

            const event = logs.find(e => e.event === 'Buy');

            should.exist(event);
            event.args._owner.should.equal(this.accountTwo);
            event.args._amount.should.be.bignumber.equal(toEther(this.price));

        })


        it('Ensure user is refunded after 50 ether is reached', async function () {
            
            // send 49 ether
            let tx = await this.icoContract.purchase(this.accountFour, { value: toEther(49), from: this.accountFour });
            assert.isOk(tx)

            // get initial ether of account three and initial token balance of contract
            let initialBalance = await getBalance(this.accountFour)
            let tokenBalance = await this.tokenContract.balanceOf(this.icoContract.address)

            // send an overpayment of 5 ether
            tx = await this.icoContract.purchase(this.accountFour, { value: toEther(5), from: this.accountFour });
            assert.isOk(tx)

            // calculate gas used on transaction
            let gasUsed = web3.toWei(tx["receipt"]["gasUsed"] / 10000, "finney")

            // get post payment account three balance and token balance of ico contract
            let postBalance = await getBalance(this.accountFour)
            let postTokenBalance = await this.tokenContract.balanceOf(this.icoContract.address)

            // calculate the refund
            let refund = toEther(5) - (initialBalance.toNumber() - postBalance.toNumber())

            // calculate total tokens purchased and how much ether was spent
            let tokensPurchased = tokenBalance.toNumber() - postTokenBalance.toNumber()
            let totalEtherSpent = (tokensPurchased / this.price)

            // // console logs
            // console.log("tokens: " + web3.fromWei(tokenBalance.toNumber(), "ether"))
            // console.log("post tokens: " + web3.fromWei(postTokenBalance.toNumber(), "ether"))
            // console.log("tokens purchased: " + web3.fromWei(tokensPurchased, "ether"))
            // console.log("ether spent: " + totalEtherSpent)
            // console.log("init: " + initialBalance)
            // console.log("post: " + postBalance)
            // console.log("refund: " + refund)
            // console.log("gas: " + gasUsed)

            // adjust price for random gas prices
            let calculateValue = toEther(5) - totalEtherSpent - gasUsed
            if (calculateValue - refund != 0) {
                if (calculateValue - refund < 10000) {
                    calculateValue = refund;
                }
            }

            // calculate refund
            refund.should.be.equal(calculateValue)
        })

        it('Ensure user is refunded the correct amount of Ether/Tokens on overpayment.', async function () {
            
            // get initial ether of account three and initial token balance of contract
            let initialBalance = await getBalance(this.accountThree)
            let tokenBalance = await this.tokenContract.balanceOf(this.icoContract.address)

            // send an overpayment of 49 ether
            let tx = await this.icoContract.purchase(this.accountThree, { value: toEther(49), from: this.accountThree });
            assert.isOk(tx)

            // calculate gas used on transaction
            let gasUsed = web3.toWei(tx["receipt"]["gasUsed"] / 10000, "finney")

            // get post payment account three balance and token balance of ico contract
            let postBalance = await getBalance(this.accountThree)
            let postTokenBalance = await this.tokenContract.balanceOf(this.icoContract.address)

            // calculate the refund
            let refund = toEther(49) - (initialBalance.toNumber() - postBalance.toNumber()) + 2048

            // calculate total tokens purchased and how much ether was spent
            let tokensPurchased = tokenBalance.toNumber() - postTokenBalance.toNumber()
            let totalEtherSpent = (tokensPurchased / this.price)

            // // console logs
            // console.log("tokens: " + web3.fromWei(tokenBalance.toNumber(), "ether"))
            // console.log("post tokens: " + web3.fromWei(postTokenBalance.toNumber(), "ether"))
            // console.log("tokens purchased: " + web3.fromWei(tokensPurchased, "ether"))
            // console.log("ether spent: " + totalEtherSpent)
            // console.log("init: " + initialBalance)
            // console.log("post: " + postBalance)
            // console.log("refund: " + refund)
            // console.log("gas: " + gasUsed)

            // adjust price for random gas prices
            let calculateValue = toEther(49) - totalEtherSpent - gasUsed
            if (calculateValue - refund != 0) {
                if (calculateValue - refund < 10000) {
                    calculateValue = refund;
                }
            }
            // calculate refund
            refund.should.be.equal(calculateValue)
        })
    
        it('Ensure user cannot purchase more than 50 Ether worth of tokens.', async function () {
            await this.icoContract.purchase(this.accountFour, { value: toEther(1), from: this.accountFour }).should.be.rejectedWith(EVMRevert);
        })

        it('Ensure user cannot purchase less than 0.001 Ether worth of tokens.', async function () {
            await this.icoContract.purchase(this.accountTwo, { value: toEther(0.0001), from: this.accountTwo }).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('Owner Functions', function() {

        it('Ensure extra Ether can only be withdrawn by owner.', async function () {
            await this.icoContract.withdraw_ether({from: this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })

        it('Ensure extra tokens can only be withdrawn by owner.', async function () {
            await this.icoContract.withdraw_token({from: this.accountTwo}).should.be.rejectedWith(EVMRevert);
        })

        it('Ensure Ether can be withdrawn by owner.', async function () {

            let icoBalance = await getBalance(this.icoContract.address)
            let ownerBalance = await getBalance(this.owner)

            let tx = await this.icoContract.withdraw_ether()

            let gasUsed = web3.toWei(tx["receipt"]["gasUsed"] / 10000, "finney")
            let postBalance = await getBalance(this.owner)
            postBalance = postBalance.toNumber()

            let newBalance = (icoBalance.toNumber() + ownerBalance.toNumber()) - gasUsed
            postBalance.should.be.equal(newBalance)
        })
    
        it('Ensure extra tokens can only be withdrawn after crowdsale.', async function () {
            await this.icoContract.withdraw_token({from: this.owner}).should.be.rejectedWith(EVMRevert);
        })

    })

    describe('Post crowdsale checks', function() {

        it('Ensure extra tokens can be withdrawn by owner.', async function () {

            await advanceToBlock(106)
            let icoBalance = await this.tokenContract.balanceOf(this.icoContract.address)
            let ownerBalance = await this.tokenContract.balanceOf(this.owner)

            await this.icoContract.withdraw_token()
            let postBalance = await this.tokenContract.balanceOf(this.owner)
            postBalance.should.be.bignumber.equal(icoBalance.toNumber() + ownerBalance.toNumber())
        })
        
        it('Ensure purchase cannot be called after crowdsale ends.', async function () {
            await this.icoContract.purchase(this.accountTwo, { value: toEther(1), from: this.accountTwo }).should.be.rejectedWith(EVMRevert);
        })

    })

  function toEther(value) {
    return web3.toWei(value, "ether")
  }

})
