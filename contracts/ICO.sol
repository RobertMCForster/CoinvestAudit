pragma solidity ^0.4.15;
import './Ownable.sol';
import './CoinvestToken.sol'; 

contract ICO is Ownable {
    CoinvestToken token;
    
    uint256 public max_contribution = 50 ether; // Whale protection: 50 ETH max deposit
    uint256 public min_contribution = 1 ether / 100; // Minnow protection: 0.01 ETH min deposit
    
    uint256 public start_time; // Starting time of the crowdsale, accepts funds after this block time
    uint256 public end_time; // Ending block of the crowdsale, no funds accepted after this time.
    uint256 public price; // Amount of token wei to be sent per each eth wei contributed.

    mapping (address => uint256) public buyers; // Keeps track of contributions from each address.
    /**
     * @notice The `price` should be calculated as follows:
     * Targeted parameters 1100 COIN for $700 USD
     * 
     * Assume ETH price = $1310 USD
     * 1310 / 700 * 1100 = 2058 
    **/
    
    /**
     * @dev Emitted when a user purchases COIN.
     * @param _owner The user who has purchase and now owns the COIN.
     * @param _amount The amount of COIN the _owner has purchased.
    **/
    event Buy(address indexed _owner, uint256 indexed _amount);

    /**
     * @dev Initialize contract.
     * @param _tokenAddress The address of the COIN token.
     * @param _start_time The time we want the ICO to start.
     * @param _end_time The time that we want the ICO to end.
     * @param _price Amount of token wei to be given for each eth wei contributed.
    **/
    function ICO(address _tokenAddress, uint256 _start_time, uint256 _end_time, uint256 _price)
      public
    {
        token = CoinvestToken(_tokenAddress);
        start_time = _start_time;
        end_time = _end_time;
        price = _price;
    }

    /**
     * @dev ERC223 compatibility.
    **/
    function tokenFallback(address, uint, bytes)
      external
      view
    {
        assert(msg.sender == address(token));
    }

    /**
     * @dev Fallback used for most purchases.
    **/
    function()
      external
      payable
    {
        purchase(msg.sender);
    }

      /**
     * @dev Main purchase function. Split from fallback to allow purchasing to another wallet.
     * @param _beneficiary The address that will receive COIN tokens.
    */
    function purchase(address _beneficiary)
      public
      payable
    {
        require(token.balanceOf(address(this)) > 0);
        require(msg.value >= min_contribution);
        require(buyers[msg.sender] < max_contribution);
        require((block.timestamp < end_time) && (block.timestamp >= start_time));
        require(tx.gasprice <= 50 * (10 ** 9));

        uint256 refundAmount = 0;
        uint256 etherAmount = msg.value;
        // If buyer is trying to buy more than their limit...
        if (buyers[msg.sender] + etherAmount > max_contribution) {
            refundAmount = (buyers[msg.sender] + etherAmount) - max_contribution;
            etherAmount = msg.value - refundAmount;
        }

        uint256 tokens_bought = etherAmount * price;
        // If the buyer is trying to buy more tokens than are available...
        if(token.balanceOf(address(this)) < tokens_bought)
        {
            refundAmount += etherAmount - (token.balanceOf(address(this)) / price);
            etherAmount = etherAmount - refundAmount;
            
            msg.sender.transfer(refundAmount);
            tokens_bought = token.balanceOf(address(this));
        // If buyer has paid too much but did not buy the rest of the tokens...
        } else if (refundAmount > 0) {
            msg.sender.transfer(refundAmount);
        }
        
        buyers[msg.sender] += etherAmount;
        token.transfer(_beneficiary, tokens_bought);
        Buy(_beneficiary, tokens_bought);
    }

    /**
     * @dev Set the timeframes of the crowdsale.
     * @param _start_time The time at which the crowdsale will start.
     * @param _end_time The time at which the crowdsale will end.
    **/
    function set_timeframes(uint256 _start_time, uint256 _end_time) 
      external
      onlyOwner
    {
        // Timeframes may only be changed before the crowdsale begins.
        require(block.timestamp < start_time);
        
        start_time = _start_time;
        end_time = _end_time;
    }
    
    /**
     * @dev Owner may withdraw the Ether that has been used to purchase COIN.
    **/
    function withdraw_ether() 
      external
      onlyOwner
    {
        owner.transfer(this.balance);
    }
    
    /**
     * @dev Owner may withdraw any remaining tokens from the crowdsale.
    **/
    function withdraw_token() 
      external
      onlyOwner
    {
        // Tokens may only be withdrawn after crowdsale ends.
        require(block.timestamp >= end_time);
        
        token.transfer(msg.sender, token.balanceOf(this));
    }

    /**
     * @dev Allow the owner to take ERC20 tokens off of this contract if they are accidentally sent.
    **/
    function token_escape(address _tokenContract)
      external
      onlyOwner
    {
        require(_tokenContract != address(token));
        
        CoinvestToken lostToken = CoinvestToken(_tokenContract);
        
        uint256 stuckTokens = lostToken.balanceOf(address(this));
        lostToken.transfer(owner, stuckTokens);
    }
    
    /**
     * @dev Used externally to check the address of the Coinvest token.
     * @return Address of the Coinvest token. 
    **/
    function tokenAddress() 
      external 
      view
    returns (address)
    {
        return address(token);
    }

}
