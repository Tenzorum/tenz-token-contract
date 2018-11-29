const TenzorumToken = artifacts.require("TenzorumToken");
const SafeMath = artifacts.require("SafeMath");

async function doDeploy(deployer) {
    await deployer.deploy(SafeMath);
    await deployer.link(SafeMath, TenzorumToken);
    await deployer.deploy(TenzorumToken);
}

module.exports = (deployer) => {
    deployer.then(async () => {
        await doDeploy(deployer);
    });
};
