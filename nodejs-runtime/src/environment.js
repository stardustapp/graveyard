// An environment maintains one mount table, similar to a plan9 namespace

const {StringLiteral, FolderLiteral} = require('./api-entries');

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
      case 'function':
        mount = { getEntry(path) {
          switch (path) {
            case '/invoke':
              return { invoke: opts.invoke };
            default:
              throw new Error(`function mounts only have /invoke`);
          }
        }};
        break;
      case 'literal':
        mount = { getEntry(path) {
          if (path) {
            throw new Error(`literal mounts have no pathing`);
          }
          return {
            get() {
              return new StringLiteral('literal', opts.string);
            }
          };
        }};
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
      return {};
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
      return new VirtualEnvEntry(this, path);
    }
  }
};

// Returns fake container entries that lets the user find the actual content
class VirtualEnvEntry {
  constructor(env, path) {
    console.log('Constructing virtual entry for', path);
    this.env = env;

    if (path === '/') {
      this.path = '';
    } else {
      this.path = path;
    }
  }

  get() {
    const children = new Array();
    this.env.mounts.forEach((mount, path) => {
      if (path.startsWith(this.path)) {
        const subPath = path.slice(this.path.length + 1);
        if (!subPath.includes('/')) {
          children.push({Name: subPath});
        }
      }
    });

    if (children.length) {
      const nameParts = this.path.split('/');
      const name = this.path ? nameParts[nameParts.length - 1] : 'root';
      return new FolderLiteral(name, children);
    } else {
      throw new Error("You pathed into a part of an env with no contents");
    }
  }
}
