const {DustMachine} = require('../src');
const process = require('process');

const machine = new DustMachine;
machine.runMain(async () => {

  const hostFs = await machine.launchEngine('host-filesystem', {
    Anchor: {
      HostPath: process.cwd(),
    },
    AllowWrites: false,
  });

  console.log('have host fs', await hostFs.Root.getEntry('src'));

});
