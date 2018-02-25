// An environment maintains one mount table, similar to a plan9 namespace

exports.Environment = class Environment {
  constructor(baseUri) {
    this.baseUri = baseUri || 'tmp://';
    this.mounts = new Map();
  }

  // creates a mount of type, with opts, and places it at path
  mount(path, type, opts) {
    opts = opts || {};
    console.log('Mounting', type, 'to', path, 'with', opts);

    // initialize the device to be mounted
    var mount;
    switch (type) {
      case 'mongodb':
        const {MongoDBMount} = require('./mounts/mongodb');
        mount = new MongoDBMount(opts);
        break;
      case 'tmp':
        const {TemporaryMount} = require('./mounts/tmp');
        mount = new TemporaryMount(opts);
        break;
      case 'bind':
        // just use the specified (already existing) mount
        mount = opts.source;
        break;
      default:
        throw new Error(`bad mount type ${type} for ${path}`);
    }

    this.mounts.set(path, mount);
  }

  // returns the least specific mount for given path
  matchPath(path) {
    var pathSoFar = '';
    const idx = path.split('/').findIndex((part, idx) => {
      if (idx) { pathSoFar += '/'+part; }
      if (this.mounts.has(pathSoFar)) { return true; }
    });
    if (idx === -1) {
      throw new Error("Mount table didn't find a match for "+path);
    }
    return {
      mount: this.mounts.get(pathSoFar),
      subPath: path.slice(pathSoFar.length),
    };
  }

  getEntry(path) {
    const {mount, subPath} = this.matchPath(path);
    if (mount) {
      return mount.getEntry(subPath);
    } else {
      throw new Error(`BUG: Path ${path} resulted to a null mount`);
    }
  }
};
