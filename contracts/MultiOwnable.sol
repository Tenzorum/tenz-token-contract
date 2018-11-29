pragma solidity ^0.4.24;

contract MultiOwnable {

  mapping (address => bool) public owners;

  modifier anyOwner() {
    require (owners[msg.sender] == true);
    _;
  }
  constructor() public {
    owners[msg.sender] = true;
  }

  function addOwner(address _owner) anyOwner public {
    owners[_owner] = true;
  }

  function removeOwner(address _owner) anyOwner public {
      require(msg.sender != _owner, "Cannot remove oneself");
      owners[_owner] = false;
  }
}
