const process = require('process');
const path = require('path');

const {SystemLoader} = require('./loader');

global.ExportAll = obj => {
  for (const key in obj) {
    global[key] = obj[key];
  }
};
ExportAll(require('./builders'));
ExportAll(require('./model'));
ExportAll(require('./field-types'));

exports.DustMachine = class DustMachine {
  constructor(hostRuntime='nodejs') {
    this.hostRuntime = hostRuntime;

    this.engineLoaders = new Array;
    this.addHostLoader('drivers');
  }

  addHostLoader(hostPath) {
    this.engineLoaders.push(new SystemLoader({
      hostDir: path.join(process.cwd(), hostPath),
    }));
  }

  async loadEngine(engineName) {
    for (const loader of this.engineLoaders) {
      if (loader.canLoad('engine.'+engineName))
        return loader.getDriver('engine.'+engineName);
    }
    throw new Error(`DustMachine didn't find engine '${engineName}' to load`);
  }

  async launchEngine(engineName, config) {
    const engine = await this.loadEngine(engineName);
    //console.log(engine)
  }

  async runMain(mainFunc) {
    console.log(`==> Starting Main...`);
    try {
      await mainFunc();
      console.log();
      console.log(`==> Main has completed successfully.`);
      console.log(`    Letting nodejs loop idle.`);
      console.log();
    } catch (err) {
      console.debug();
      console.debug(`!!! Main has crashed!`);
      console.debug(err.stack);
      process.exit(3);
    }
  };
}
