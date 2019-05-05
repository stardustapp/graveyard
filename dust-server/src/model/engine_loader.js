// TODO: when should dynamic loading be allowed?

const fs = require('fs');
const path = require('path');
const {promisify} = require('util');

const readDir = promisify(fs.readdir);

const defaultDir = path.join('src', 'engines');
const importantFiles = [
  'model.js', 'lifecycle.js', // established concepts
  'ddp-api.js', 'compile.js', 'json-codec.js', // legacy files
];

// TODO: perform the file I/O async.
// https://stackoverflow.com/a/21681700
// console.log(require.extensions['.js'].toString())

class DynamicEngineLoader {
  constructor({
    hostDir = defaultDir,
  }={}) {
    this.cache = new LoaderCache(
      this.requireEngine.bind(this, hostDir),
      key => key.split('/')[0]);
    this.availableEngines = fs.readdirSync(hostDir);
  }

  // consumer APIs
  canLoad(key) {
    return this.availableEngines.includes(this.cache.keyFunc(key));
  }
  async getEngine(key) {
    const result = await this.cache.get(key);
    if (result === true) {
      return GraphEngine.getOrPromise(key);
    } else if (result === false) throw new Error(
      `Engine ${key} isn't available to load from source`);
    else if (result instanceof Error) throw new Error(
      `Engine ${key} failed to load due to ${result.constructor.name}`);
    else throw new Error(
      `BUG: somethin went wrong loading engine '${key}'`);
  }

  async requireEngine(hostDir, key, name) {
    if (!this.availableEngines.includes(name))
      return false; // engine doesn't exist

    const engineDir = path.join(hostDir, name);
    //console.log('Dynamically loading engine from', engineDir);
    try {
      console.group(`[${key}] Loading graph engine...`);
      await this.requireFromPath(engineDir);
      // requiring model.js registers the engine, so just say we succeeded
      return true;
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
    if (!engineFiles.includes('model.js')) throw new Error(
      `Engine directory is missing model.js`);

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
      require(path.join('..', '..', fullPath));
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    DynamicEngineLoader,
  };
}
