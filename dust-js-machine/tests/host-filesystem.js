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

  const srcDir = await hostFs.Root.getEntry('src');
  const indexFile = await srcDir.getFile('index.js');
  const rawIndex = await indexFile.readAll({encoding: 'utf-8'});
  console.log('have host fs', rawIndex);

});
