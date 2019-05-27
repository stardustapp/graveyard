// TODO: when should dynamic loading be allowed?

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const readDir = promisify(fs.readdir);

const LoaderCache = require('./utils/loader-cache.js');
const {DriverBuilder} = require('./builders/driver.js');

const importantFiles = [
  'schema.js', 'lifecycle.js', // established concepts
  'ddp-api.js', 'compile.js', 'json-codec.js', // legacy files
];

// TODO: perform the file I/O async.
// https://stackoverflow.com/a/21681700
// console.log(require.extensions['.js'].toString())
exports.SystemLoader = class SystemLoader {
  constructor({
    hostDir,
  }={}) {
    this.cache = new LoaderCache(
      this.requireDriver.bind(this, hostDir),
      key => key.split('/')[0]);
    this.availableDrivers = fs.readdirSync(hostDir);
  }

  // consumer APIs
  canLoad(key) {
    return this.availableDrivers.includes(this.cache.keyFunc(key));
  }
  async getDriver(key) {
    const result = await this.cache.get(key);
    // throw new Error(
    //   `Driver ${key} isn't available to load from source`);
    if (result instanceof Error) throw new Error(
       `Driver ${key} failed to load due to ${result.constructor.name}`);
    else return result;
  }

  async requireDriver(hostDir, key) {
    if (!this.availableDrivers.includes(key))
      return false; // engine doesn't exist

    global.CURRENT_LOADER = new DriverBuilder(key);

    const engineDir = path.join(hostDir, key);
    //console.log('Dynamically loading engine from', engineDir);
    try {
      console.group(`[${key}] Loading graph engine...`);
      await this.requireFromPath(engineDir);
      return CURRENT_LOADER.compile();
    } catch (err) {
      console.error('Error when dynamically loading engine from', engineDir);
      console.error(err.stack);
      return err;
    } finally {
      console.groupEnd();
    }
  }

  async requireFromPath(engineDir) {
    const engineFiles = await readDir(engineDir);
    if (!engineFiles.includes('schema.js')) throw new Error(
      `Driver directory is missing schema.js`);

    // TODO: error if package.json but not node_modules
    // or maybe actually parse package.json and be smart

    //console.log('Dynamically loading model engine from', engineDir, engineFiles);
    const necesaryFiles = new Array;

    for (const engineFile of engineFiles) {
      if (importantFiles.includes(engineFile))
        necesaryFiles.push(path.join(engineDir, engineFile));
    }

    const behaviorDir = path.join(engineDir, 'behaviors');
    try {
      const behaviorFiles = await readDir(behaviorDir);
      for (const behaviorFile of behaviorFiles) {
        if (behaviorFile.endsWith('.js'))
          necesaryFiles.push(path.join(behaviorDir, behaviorFile));
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.warn('No behaviors/ directory found in', engineDir);
      } else throw err;
    }

    console.log('Requiring', necesaryFiles.length, 'engine files from', engineDir, '...');
    for (const fullPath of necesaryFiles)
      require(fullPath);
  }
}
