# CoinvestAudit

Current Coinvest token and crowdsale contracts with associated truffles.

<h2>Requirements for the ICO.sol contract</h2>:

Ability to distribute 52.5 million tokens (manually transferred to contract).
No address should be able to buy more than 50 Ether worth of tokens.
A user should not be able to purchase less than 0.001 Ether worth of tokens.
In the case an address tries to buy more than 50 Ether worth of tokens, they should be refunded the overpayment and only given tokens for the accepted Ether.
A user should only be able to contribute during the crowdsale times.
A user should not be able to pay more than a 50 Gwei gas price to buy tokens.
If a user tries to buy more than the amount of tokens in the contract, they should only receive the tokens that are still left and should be refunded for the rest of their contribution.
Timeframe should only be able to be set by owner and only during crowdsale times.
The owner should be able to withdraw any tokens not sold during the crowdsale AFTER the crowdsale has completed.
The owner should be able to withdraw Ether in the contract at any time.
The contract must be ERC223 compatible.
