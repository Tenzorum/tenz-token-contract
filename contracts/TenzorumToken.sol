pragma solidity ^0.4.24;

import "./SafeMath.sol";
import "./MultiOwnable.sol";
import "./ERC20.sol";
import "./ApproveAndCall.sol";

// ---------------------------------------------------------------------
// 'Tenzorum Token - TENZ' token contract: https://tenzorum.org
//
// Symbol      : TENZ
// Name        : Tenzorum Token
// Total supply: 1,237,433,627
// Decimals    : 18
//
// Author: Radek Ostrowski / https://startonchain.com
// ---------------------------------------------------------------------

/**
 * @title Tenzorum Token
 * @dev ERC20 token with initial transfers blocked and specific minting conditions
 */
contract TenzorumToken is MultiOwnable {
    using SafeMath for uint256;

    event Transfer(address indexed _from, address indexed _to, uint256 _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);

    event TransfersEnabled();
    event TransferRightGiven(address indexed _to);
    event TransferRightCancelled(address indexed _from);
    event WithdrawnERC20Tokens(address indexed _tokenContract, address indexed _owner, uint256 _balance);
    event WithdrawnEther(address indexed _owner, uint256 _balance);

    string public constant name = "Tenzorum Token";
    string public constant symbol = "TENZ";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    uint256 public constant initialSupply = 1237433627 * (10 ** uint256(decimals));
    uint256 public constant maxSupply = initialSupply * 2;

    uint256 public constant a1 = 2354325774353120243531;
    uint256 public constant r = 2239657547574836; //r is negative

    //Single time period is equal to 10 minutes - 600 seconds;
    uint256 public constant periodUnit = 10 minutes;
    //Time when tokens become openly transferable - period zero
    uint256 public firstPeriodStart;
    uint256 public constant lastPeriod = 1051200;

    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) internal allowed;

    //This mapping is used for the token owner(s) to
    //transfer tokens before they are transferable by the public
    mapping(address => bool) public transferGrants;
    //This flag controls the global token transfer
    bool public transferable;

    /**
     * @dev Modifier to check if tokens can be transferred.
     */
    modifier canTransfer() {
        require(transferable || transferGrants[msg.sender]);
        _;
    }

    /**
     * @dev The constructor sets the original `owner` of the contract
     * to the sender account and assigns them all tokens.
     */
    constructor() public {
        totalSupply = initialSupply;
        balances[msg.sender] = totalSupply;
        transferGrants[msg.sender] = true;
    }

    /**
    * @dev Gets the balance of the specified address.
    * @param _owner The address to query the the balance of.
    * @return An uint256 representing the amount owned by the passed address.
    */
    function balanceOf(address _owner) public view returns (uint256) {
        return balances[_owner];
    }

    /**
    * @dev Transfer token for a specified address
    * @param _to The address to transfer to.
    * @param _value The amount to be transferred.
    */
    function transfer(address _to, uint256 _value) canTransfer public returns (bool) {
        require(_to != address(0));
        require(_value <= balances[msg.sender]);
        // SafeMath.sub will throw if there is not enough balance.
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    /**
     * @dev Transfer tokens from one address to another
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address _from, address _to, uint256 _value) canTransfer public returns (bool) {
        require(_to != address(0));
        require(_value <= balances[_from]);
        require(_value <= allowed[_from][msg.sender]);
        balances[_from] = balances[_from].sub(_value);
        balances[_to] = balances[_to].add(_value);
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
        emit Transfer(_from, _to, _value);
        return true;
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     *
     * Beware that changing an allowance with this method brings the risk that someone may use both the old
     * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
     * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     * @param _spender The address which will spend the funds.
     * @param _value The amount of tokens to be spent.
     */
    function approve(address _spender, uint256 _value) canTransfer public returns (bool) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /**
     * @dev Function to check the amount of tokens that an owner allowed to a spender.
     * @param _owner address The address which owns the funds.
     * @param _spender address The address which will spend the funds.
     * @return A uint256 specifying the amount of tokens still available for the spender.
     */
    function allowance(address _owner, address _spender) public view returns (uint256) {
        return allowed[_owner][_spender];
    }

    /**
     * @dev Increase the amount of tokens that an owner allowed to a spender.
     *
     * approve should be called when allowed[_spender] == 0. To increment
     * allowed value is better to use this function to avoid 2 calls (and wait until
     * the first transaction is mined)
     * From MonolithDAO Token.sol
     * @param _spender The address which will spend the funds.
     * @param _addedValue The amount of tokens to increase the allowance by.
     */
    function increaseApproval(address _spender, uint _addedValue) canTransfer public returns (bool) {
        allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    /**
     * @dev Decrease the amount of tokens that an owner allowed to a spender.
     *
     * approve should be called when allowed[_spender] == 0. To decrement
     * allowed value is better to use this function to avoid 2 calls (and wait until
     * the first transaction is mined)
     * From MonolithDAO Token.sol
     * @param _spender The address which will spend the funds.
     * @param _subtractedValue The amount of tokens to decrease the allowance by.
     */
    function decreaseApproval(address _spender, uint _subtractedValue) canTransfer public returns (bool) {
        uint oldValue = allowed[msg.sender][_spender];
        if (_subtractedValue > oldValue) {
            allowed[msg.sender][_spender] = 0;
        } else {
            allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
        }
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    /**
     * @dev Function to approve the transfer of the tokens and to call another contract in one step
     * @param _recipient The target contract for tokens and function call
     * @param _value The amount of tokens to send
     * @param _data Extra data to be sent to the recipient contract function
     */
    function approveAndCall(address _recipient, uint _value, bytes _data) canTransfer public returns (bool) {
        allowed[msg.sender][_recipient] = _value;
        ApproveAndCall(_recipient).receiveApproval(msg.sender, _value, address(this), _data);
        emit Approval(msg.sender, _recipient, allowed[msg.sender][_recipient]);
        return true;
    }

    /**
     * @dev Burns a specific amount of tokens.
     * @param _value The amount of token to be burned.
     */
    function burn(uint256 _value) canTransfer public returns (bool) {
        require(_value <= balances[msg.sender]);
        address burner = msg.sender;
        balances[burner] = balances[burner].sub(_value);
        totalSupply = totalSupply.sub(_value);
        emit Transfer(burner, address(0), _value);
        return true;
    }

    function currentPeriod() view returns (uint256) {
        if(firstPeriodStart == 0) return 0;
        return (now - firstPeriodStart).div(periodUnit);
    }

    function maxAllowedSupply(uint256 _period) view returns (uint256) {
        if(_period == 0) return initialSupply;
        if(_period >= lastPeriod) return maxSupply;

        //sum of newly minted tokens at given period
        uint256 sn = _period*(2*a1-r*(_period-1))/2;

        uint256 currentMaxSupply = initialSupply + sn;
        if(currentMaxSupply > maxSupply) return maxSupply;
        return currentMaxSupply;
    }

    /**
     * @dev Mints a specific amount of tokens restricted by the total supply formulae
     * @param _value The amount of tokens to be minted,
     *               if bigger than the allowed amount the maximum allowed amount will be minted
     */
    function mint(address _recipient, uint256 _value) anyOwner canTransfer public returns (uint256) {
        uint256 currentMaxAllowedSupply = maxAllowedSupply(currentPeriod());
        uint256 allowedToMint = currentMaxAllowedSupply.sub(totalSupply);
        uint256 mintAmount;
        if (allowedToMint < _value) {
            mintAmount = allowedToMint;
        } else {
            mintAmount = _value;
        }

        totalSupply = totalSupply.add(mintAmount);
        balances[_recipient] = balances[_recipient].add(mintAmount);
        emit Transfer(address(0), _recipient, mintAmount);

        return mintAmount;
    }

    /**
     * @dev Enables the transfer of tokens for everyone
     */
    function enableTransfers() anyOwner public {
        require(!transferable);
        transferable = true;
        firstPeriodStart = now;
        emit TransfersEnabled();
    }

    /**
     * @dev Assigns the special transfer right, before transfers are enabled
     * @param _to The address receiving the transfer grant
     */
    function grantTransferRight(address _to) anyOwner public {
        require(!transferable);
        require(!transferGrants[_to]);
        require(_to != address(0));
        transferGrants[_to] = true;
        emit TransferRightGiven(_to);
    }

    /**
     * @dev Removes the special transfer right, before transfers are enabled
     * @param _from The address that the transfer grant is removed from
     */
    function cancelTransferRight(address _from) anyOwner public {
        require(!transferable);
        require(transferGrants[_from]);
        transferGrants[_from] = false;
        emit TransferRightCancelled(_from);
    }

    /**
     * @dev Allows to transfer out the balance of arbitrary ERC20 tokens from the contract.
     * @param _token The contract address of the ERC20 token.
     */
    function withdrawERC20Tokens(ERC20 _token) anyOwner public {
        uint256 totalBalance = _token.balanceOf(address(this));
        require(totalBalance > 0);
        _token.transfer(msg.sender, totalBalance);
        emit WithdrawnERC20Tokens(address(_token), msg.sender, totalBalance);
    }

    /**
     * @dev Allows to transfer out the ether balance that was forced into this contract, e.g with `selfdestruct`
     */
    function withdrawEther() anyOwner public {
        uint256 totalBalance = address(this).balance;
        require(totalBalance > 0);
        msg.sender.transfer(totalBalance);
        emit WithdrawnEther(msg.sender, totalBalance);
    }
}
