const TenzorumToken = artifacts.require("./TenzorumToken.sol");
const EtherForcer = artifacts.require("./test/EtherForcer.sol");
const ApproveAndCallMock = artifacts.require("./test/ApproveAndCallMock.sol");

let owner;
let user1;
let user2;
let token;

const initSupply = web3.toWei("1237433627", 'ether');
const maxSupply = web3.toWei("2474867254", 'ether');
const moreThenTotalSupply = web3.toWei("2474867255", 'ether');
const oneToken = web3.toWei("1", 'ether');
const twoTokens = web3.toWei("2", 'ether');
const threeBillionTokens = web3.toWei("3000000000", 'ether');;
const periodUnit = 600;
const lastPeriod = 1051200;

function increaseTime(addSeconds) {
    web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [addSeconds],
        id: 0
    });
    web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_mine",
        params: [],
        id: 0
    });
}

contract('Tenzorum Token', (accounts) => {

    beforeEach(async () => {
        owner = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];

        token = await TenzorumToken.new();
    });

    function expectRevert(e, msg) {
        assert(e.message.search('revert') >= 0, msg);
    }

    it("Fresh token has correct initial values", async () => {
        assert("Tenzorum Token" == await token.name.call());
        assert("TENZ" == await token.symbol.call());
        assert(18 == (await token.decimals.call()).toNumber());
        assert(!(await token.transferable.call()));
        assert(await token.transferGrants.call(owner));
        assert(initSupply == (await token.totalSupply.call()).toNumber());
    });

    it("Can transfer tokens to any address when allowed", async () => {
        await token.enableTransfers();
        assert(await token.transferable.call());

        try {
            await token.enableTransfers();
            assert(false);
        } catch (e) {
            expectRevert(e, "transfers already enabled");
        }

        let tokenBalanceUserBefore = (await token.balanceOf.call(user1)).toNumber();
        await token.transfer(user1, oneToken, {from: owner});
        let tokenBalanceUserAfter = (await token.balanceOf.call(user1)).toNumber();
        assert(tokenBalanceUserBefore + oneToken == tokenBalanceUserAfter);
    });

    it("Can only transfer when granted right before transfers enabled", async () => {
        await token.transfer(user1, twoTokens, {from: owner});
        try {
            await token.transfer(owner, oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "transfers not enabled");
        }

        await token.grantTransferRight(user1);
        assert(await token.transferGrants.call(user1));
        try {
            await token.grantTransferRight(user1);
            assert(false);
        } catch (e) {
            expectRevert(e, "user1 already has grant transfer");
        }

        try {
            await token.grantTransferRight('0x0');
            assert(false);
        } catch (e) {
            expectRevert(e, "address(0) is excluded from transfer grants");
        }

        await token.transfer(owner, oneToken, {from: user1});

        await token.cancelTransferRight(user1);
        assert(!(await token.transferGrants.call(user1)));
        try {
            await token.cancelTransferRight(user1);
            assert(false);
        } catch (e) {
            expectRevert(e, "user1 already cancelled grant transfer");
        }
        assert(!(await token.transferGrants.call('0x0')));

        try {
            await token.transfer(owner, oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "transfers not enabled");
        }
        assert(oneToken == (await token.balanceOf.call(user1)).toNumber());
    });

    it("Once transfers enabled cannot change transfer rights", async () => {
        await token.enableTransfers();

        try {
            await token.grantTransferRight(user1);
            assert(false);
        } catch (e) {
            expectRevert(e, "transfers are already enabled");
        }
        assert(!(await token.transferGrants.call(user1)));

        try {
            await token.cancelTransferRight(owner);
            assert(false);
        } catch (e) {
            expectRevert(e, "transfers are already enabled");
        }
        assert(await token.transferGrants.call(owner));
    });

    it("Only valid token transfers succeed", async () => {
        await token.enableTransfers();

        try {
            await token.transfer('0x0', twoTokens, {from: owner});
            assert(false);
        } catch (e) {
            expectRevert(e, "cannot transfer to address(0)");
        }

        try {
            await token.transfer(user1, moreThenTotalSupply, {from: owner});
            assert(false);
        } catch (e) {
            expectRevert(e, "cannot transfer more than in the balance");
        }
    });

    it("Allowed third party can transfer tokens on ones behalf", async () => {
        await token.transfer(user2, twoTokens, {from: owner});

        try {
            await token.approve(user1, twoTokens, {from: user2});
            assert(false);
        } catch (e) {
            expectRevert(e, "approve shouldn't work before tokens are transferable");
        }

        await token.enableTransfers();
        await token.approve(user1, twoTokens);
        assert(twoTokens == (await token.allowance.call(owner, user1)).toNumber(), "allowance matches");
        await token.transferFrom(owner, user1, oneToken, {from: user1});
        try {
            await token.transferFrom(owner, user1, twoTokens, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "transferring more than allowed");
        }
        try {
            await token.transferFrom(owner, user1, moreThenTotalSupply, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "transferring more than the owner has");
        }
        try {
            await token.transferFrom(owner, '0x0', oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "transferring to address(0) is not allowed");
        }
        assert(oneToken == (await token.balanceOf.call(user1)).toNumber(), "balance matches");
    });

    it("Increasing and decreasing approval works correctly", async () => {
        try {
            await token.increaseApproval(user1, oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "increaseApproval shouldn't work before tokens are transferable");
        }

        try {
            await token.decreaseApproval(user1, oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "decreaseApproval shouldn't work before tokens are transferable");
        }

        await token.enableTransfers();
        await token.approve(user1, oneToken);
        assert(oneToken == (await token.allowance.call(owner, user1)).toNumber());

        await token.increaseApproval(user1, oneToken);
        assert(twoTokens == (await token.allowance.call(owner, user1)).toNumber());

        await token.decreaseApproval(user1, oneToken);
        assert(oneToken == (await token.allowance.call(owner, user1)).toNumber());

        await token.decreaseApproval(user1, twoTokens);
        assert(0 == (await token.allowance.call(owner, user1)).toNumber());
    });

    it("Anyone can burn tokens", async () => {
        await token.transfer(user1, twoTokens, {from: owner});

        try {
            await token.burn(oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "burn shouldn't work before tokens are transferable");
        }

        await token.enableTransfers();
        await token.burn(oneToken, {from: owner});
        await token.burn(oneToken, {from: user1});
        try {
            await token.burn(twoTokens, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "trying to burn more then the user has");
        }
        assert(oneToken == (await token.balanceOf.call(user1)).toNumber());
    });

    it("Token refuses to accept ether transfers", async () => {
        var tx = {from: owner, to: token.address, value: 10000};
        try {
            await web3.eth.sendTransaction(tx);
            assert(false);
        } catch (e) {
            expectRevert(e, "token doesn't accept ether");
        }
    });

    it("Only owner can withdraw arbitrary tokens sent to this smart contract", async () => {
        let otherTokentoken = await TenzorumToken.new();

        await otherTokentoken.enableTransfers();
        await otherTokentoken.transfer(token.address, oneToken, {from: owner});

        try {
            await token.withdrawERC20Tokens(otherTokentoken.address, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "only owner can execute this");
        }

        await token.withdrawERC20Tokens(otherTokentoken.address, {from: owner});
        assert(0 == (await otherTokentoken.balanceOf.call(token.address)).toNumber());

        try {
            await token.withdrawERC20Tokens(otherTokentoken.address, {from: owner});
            assert(false);
        } catch (e) {
            expectRevert(e, "withdrawing fails when zero balance");
        }
    });

    it("ApproveAndCall works correctly", async () => {
        let mock = await ApproveAndCallMock.new();
        let failingMock = await TenzorumToken.new();

        try {
            await token.approveAndCall(mock.address, oneToken, '0x0', {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "approveAndCall shouldn't work before tokens are transferable");
        }

        await token.enableTransfers();
        assert(await token.approveAndCall(mock.address, oneToken, '0x0'));

        assert(oneToken == (await mock.amount.call()).toNumber(), "amount matches");
        assert(owner == await mock.from.call(), "from matches");
        assert(token.address == await mock.tokenContract.call(), "token matches");

        try {
            await token.approveAndCall(failingMock.address, oneToken, '0x0');
            assert(false);
        } catch (e) {
            expectRevert(e, "token doesn't implement token fallback");
        }
    });

    it("Emergency ether withdrawal works", async () => {
        try {
            await token.withdrawEther({from: owner});
            assert(false);
        } catch (e) {
            expectRevert(e, "token balance is 0 so can't withdraw");
        }
        let etherForcer = await EtherForcer.new({value: 10000});
        assert(10000 == (await web3.eth.getBalance(etherForcer.address)).toNumber());
        await etherForcer.forceEther(token.address);
        assert(10000 == (await web3.eth.getBalance(token.address)).toNumber(), "injected some ether");
        try {
            await token.withdrawEther({from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "only owner can call");
        }
        await token.withdrawEther({from: owner});
        assert(0 == (await web3.eth.getBalance(token.address)).toNumber(), "empty");
    });

    it("Can add and remove new owners", async () => {
        assert(!await token.owners.call(user1), "shouldnt be owner");
        await token.addOwner(user1);
        assert(await token.owners.call(user1), "should be owner");

        try {
            await token.removeOwner(user1, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "cannot remove oneself");
        }
        assert(await token.owners.call(user1), "should be owner");

        await token.removeOwner(user1);
        assert(!await token.owners.call(user1), "shouldnt be owner");
    });

    it("Token minting works as expected", async () => {
        assert(0 == (await token.firstPeriodStart.call()).toNumber(), "firstPeriodStart is not set yet");
        await token.mint(user1, oneToken, {from: owner});
        assert(0 == (await token.balanceOf.call(user1)).toNumber(), "shouldn't mint any tokens at this point");

        try {
            await token.startMintingPeriod();
            assert(false);
        } catch (e) {
            expectRevert(e, "Need to enable transfers first");
        }

        await token.enableTransfers();
        await token.startMintingPeriod();
        assert((await token.firstPeriodStart.call()).toNumber() > 0, "firstPeriodStart is set");

        await token.mint(user1, threeBillionTokens, {from: owner});
        //shouldn't mint any tokens yet as no periods have passed
        assert(0 == (await token.balanceOf.call(user1)).toNumber(), "should mint 0 tokens at this point");

        try {
            await token.mint(user1, oneToken, {from: user1});
            assert(false);
        } catch (e) {
            expectRevert(e, "Cannot mint token when not owner");
        }

        let i;
        const expectedMintedTokenAmounts = [2354, 4708, 7062, 9417, 11771];
        for(i=0; i<5; i++){
            //go into future period
            increaseTime(periodUnit);
            await token.mint(user1, threeBillionTokens, {from: owner});
            assert(expectedMintedTokenAmounts[i] == Math.floor(web3.fromWei(await token.balanceOf.call(user1), "ether").toNumber()));
        }

        increaseTime(periodUnit);
        await token.mint(user1, oneToken, {from: owner});
        assert(11771+1 == Math.floor(web3.fromWei(await token.balanceOf.call(user1), "ether").toNumber()), "minted one token");

        //beyond 2 years should not mint more tokens, limited by maxSupply
        increaseTime(lastPeriod*periodUnit);
        await token.mint(user1, threeBillionTokens, {from: owner});
        assert(maxSupply == (await token.totalSupply.call()).toNumber(), "shouldn't mint any more tokens at this point");
    });

    it("CurrentPeriod works correctly", async () => {
        assert(0 == (await token.firstPeriodStart.call()), "firstPeriodStart is not set yet");
        assert(0 == await token.currentPeriod.call(), "current period should be 0");

        await token.enableTransfers();
        await token.startMintingPeriod();

        assert(0 == await token.currentPeriod.call(), "current period should still be 0");

        increaseTime(periodUnit);
        assert(1 == await token.currentPeriod.call(), "current period should still be 1");

        increaseTime(periodUnit);
        assert(2 == await token.currentPeriod.call(), "current period should still be 2");
    });

    it("MaxAllowedSupply works correctly", async () => {
        assert(0 == (await token.firstPeriodStart.call()), "firstPeriodStart is not set yet");
        assert(initSupply == (await token.maxAllowedSupply.call(0)).toNumber(), "minting not started, should be at initial supply");

        await token.enableTransfers();
        await token.startMintingPeriod();

        assert((await token.firstPeriodStart.call()).toNumber() > 0, "firstPeriodStart is set");

        const expectedFirstValues = [1237433627, 1237435981, 1237438335, 1237440689, 1237443044, 1237445398, 1237447752, 1237450107, 1237452461, 1237454815, 1237457170];
        let i;
        for(i = 0; i <= 10; i++) {
            assert(expectedFirstValues[i] == Math.floor(web3.fromWei((await token.maxAllowedSupply.call(i)).toNumber(), 'ether')));
        }

        //periods 1051197-1051202
        const expectedLastValues = [2474867253, 2474867253, 2474867254, 2474867254, 2474867254, 2474867254];
        for(i = 0; i < 6; i++) {
            let j = i + 1051197;
            assert(expectedLastValues[i] == Math.floor(web3.fromWei((await token.maxAllowedSupply.call(j)).toNumber(), 'ether')));
        }
    });

    // let BigNumber = require('bignumber.js');
    // ------
    // it("helper", async () => {
    //
    //     //Sn = n*(2*a1+(n−1)*r)/2 = n*(a1+an)/2
    //     //an = a1 + (n-1)*r  => r=(an-a1)/(n-1)
    //     //a1 = 2*Sn/n - an
    //
    //     const Sn = new BigNumber(web3.toWei('1237433627','ether')); //total minted tokens
    //
    //     const n = new BigNumber("1051202"); //last period
    //     const an = 0; //tokens minted at last period
    //
    //     //let a1 = new BigNumber(web3.toWei('2354.3257743531203' , 'ether')); //2*Sn/n - an;
    //     let a1 = Sn.times(2).div(n);
    //     console.log("a1", a1.toString());
    //
    //     //let r = new BigNumber(web3.toWei('0.002239657547574836', 'ether')); //(an-a1)/(n-1); //r is negative
    //     let r = a1.div(n-1);
    //     console.log("r",r.toString());
    //
    //     let i;
    //     let sum = 0;
    //     console.log("period;", "tokens-issued-at-period;", "sum-of-tokens-issued;","calculated-sum");
    //     for(i=1; i<=n; i++){
    //         //sum += a1+(i-1)*r;
    //         const big_i = new BigNumber(i);
    //         const sn_i = big_i.times(a1.times(2).minus( (r.times(big_i.minus(1)))).div(2));
    //
    //         if(i < 10 || i % 100000 == 0 || i >= n-5) console.log(i, sn_i.plus(initSupply).toString()); //console.log(i, a1+(i-1)*r, sn_i, sum);
    //     }
    //
    //     console.log(Sn.toString(), Sn.plus(initSupply).toString());
    //     //console.log("sum",sum);
    //     //console.log("total", n*(a1+an)/2);
    //
    // });

});
