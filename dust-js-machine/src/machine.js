const process = require('process');
const path = require('path');

const {SystemLoader} = require('./loader.js');
const {AsyncCache} = require('./utils/async-cache.js');

exports.DustMachine = class DustMachine {
  constructor(hostRuntime='nodejs') {
    this.hostRuntime = hostRuntime;

    this.driverCache = new AsyncCache;
    this.driverLoaders = new Array;

    const machineRoot = path.dirname(__dirname);
    this.addHostLoader(path.join(machineRoot, 'drivers'));

    const appRoot = process.cwd();
    if (appRoot !== machineRoot)
      this.addHostLoader(path.join(appRoot, 'drivers'));
  }
  addHostLoader(hostPath) {
    this.driverLoaders.push(new SystemLoader({
      hostDir: hostPath,
    }));
  }

  async findDriver(type, name) {
    const driverKey = `${type}.${name}`;
    for (const loader of this.driverLoaders) {
      if (!loader.canLoad(driverKey)) continue;
      return await loader.getDriver(driverKey);
    }
    throw new Error(`DUST Driver '${driverKey}' was not found`);
  }

  async loadDriver(type, name) {
    return this.driverCache.get(`${type}.${name}`, async input => {
      const driver = await this.findDriver(type, name)
      if (type === 'base') {
        return driver;
      } else {
        const base = await this.loadDriver('base', type);
        return await base._callLifecycle('buildDriver', driver, this);
      }
    });
  }

  async launchEngine(engineName, config) {
    const engine = await this.loadDriver('engine', engineName);
    console.log('Launching engine', engineName, '...');
    return await engine.launch(config);
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
