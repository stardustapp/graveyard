// An environment maintains one mount table, similar to a plan9 namespace
// Generally one Environment is equivilent to one HTTP Origin
// (that is, it doesn't handle differing hostnames or protocols)

class Environment {
  constructor(baseUri) {
    this.baseUri = baseUri || 'tmp://';
    this.mounts = new Map();
  }

  bind(path, source) {
    return this.mount(path, 'bind', {source});
  }

  // creates a mount of type, with opts, and places it at path
  async mount(path, type, opts) {
    opts = opts || {};
    console.log('Mounting', type, 'to', path, 'with', opts);

    // initialize the device to be mounted
    var mount;
    switch (type) {
      case 'idb-treestore':
        mount = new IdbTreestoreMount(opts);
        break;
      case 'fs-string-dict':
        mount = new FsStringDictMount(opts);
        break;
      case 'tmp':
        mount = new TemporaryMount(opts);
        break;
      case 'bind':
        // just use the specified (already existing) mount
        mount = opts.source;
        break;
      case 'function':
        mount = { async getEntry(path) {
          switch (path) {
            case '/invoke':
              return {
                invoke: opts.invoke,
              };
            default:
              throw new Error(`function mounts only have /invoke`);
          }
        }};
        break;
      case 'literal':
        mount = { async getEntry(path) {
          if (path) {
            throw new Error(`literal mounts have no pathing`);
          }
          return {
            async get() {
              return new StringLiteral('literal', opts.string);
            }
          };
        }};
        break;
      default:
        throw new Error(`bad mount type ${type} for ${path}`);
    }

    if (mount.init)
      await mount.init();

    this.mounts.set(path, mount);
  }

  // returns the MOST specific mount for given path
  matchPath(path) {
    if (!path) {
      throw new Error("matchPath() requires a path");
    }
    var pathSoFar = path;
    while (true) {
      if (this.mounts.has(pathSoFar)) {
        return {
          mount: this.mounts.get(pathSoFar),
          subPath: path.slice(pathSoFar.length),
        };
      }
      if (pathSoFar.length === 0) break;
      pathSoFar = pathSoFar.slice(0, pathSoFar.lastIndexOf('/'));
    };
    return {};
  }

  getSubPathEnv(path) {
    if (!path || path === '/')
      return this;

    const subEnv = new Environment(this.baseUri + path);
    Array.from(this.mounts.entries()).forEach(([mount, device]) => {
      if (mount.startsWith(path)) {
        console.log('device is CHILD OR MATCH of desired path');
      } else if (path.startsWith(mount)) {
        console.log('device is PARENT of desired path');
        const subPath = path.slice(mount.length);
        subEnv.bind('', { getEntry: (p) => {
          return device.getEntry(subPath + p);
        }});
        // TODO: what if there's multiple parents? need the most accurate
      }
    });
    return subEnv;
  }

  async getEntry(path, required, apiCheck) {
    // show our root if we have to
    // TODO: support a mount to / while adding mounted children, if any?
    if (!path)
      return new VirtualEnvEntry(this, path);
    if (path === '/' && !this.mounts.has(''))
      return new VirtualEnvEntry(this, path);

    var entry;
    const {mount, subPath} = this.matchPath(path);
    if (mount && mount.getEntry) {
      entry = await mount.getEntry(subPath);
    }

    // TODO: check for children mounts, then return new VirtualEnvEntry(this, path);

    if (required && !entry) {
      throw new Error(`getEntry(${JSON.stringify(path)}) failed but was marked required`);
    }
    if (apiCheck && entry && !entry[apiCheck]) {
      throw new Error(`getEntry(${JSON.stringify(path)}) found a ${entry.constructor.name} which doesn't present desired API ${apiCheck}`);
    }

    return entry;
  }

  inspect() {
    const mountNames = new Array();
    this.mounts.forEach((_, key) => mountNames.push(key));
    return `<Environment [${mountNames.join(' ')}]>`;
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

  async enumerate(enumer) {
    const children = new Array();
    this.env.mounts.forEach((mount, path) => {
      if (path.startsWith(this.path)) {
        const subPath = path.slice(this.path.length + 1);
        if (!subPath.includes('/')) {
          children.push({name: subPath, mount, path});
        }
      }
    });
    if (!children.length)
      return;

    enumer.visit({Type: 'Folder'});
    if (enumer.canDescend()) {
      for (const child of children) {
        enumer.descend(child.name);
        try {
          const rootEntry = await child.mount.getEntry('');
          if (rootEntry.enumerate) {
            await rootEntry.enumerate(enumer);
          } else {
            enumer.visit(await rootEntry.get());
          }
        } catch (err) {
          console.warn('Enumeration had a failed node @', JSON.stringify(child.name), err);
          enumer.visit({Type: 'Error', StringValue: err.message});
        }
        enumer.ascend();
      }
    }
  }
}
