exports.TemporaryMount = class TemporaryMount {
  constructor(opts) {
    this.entries = new Map();
  }

  // returns the least specific entry for given path
  matchPath(path) {
    var pathSoFar = '';
    const idx = path.split('/').findIndex((part, idx) => {
      if (idx) { pathSoFar += '/'+part; }
      if (this.entries.has(pathSoFar)) { return true; }
    });
    if (idx === -1) {
      return {};
    }
    return {
      entry: this.entries.get(pathSoFar),
      subPath: path.slice(pathSoFar.length),
    };
  }

  getEntry(path, onlyIfExists=false) {
    const {entry, subPath} = this.matchPath(path);
    if (entry) {
      if (subPath) {
        if (!entry.getEntry) {
          throw new Error(`tmp-ns path "${path}" isn't pathable`)
        }
        const innerEntry = entry.getEntry(subPath);
        if (!onlyIfExists || innerEntry) {
          return new TmpEntry(this, path, entry.getEntry(subPath));
        }
      } else {
        return new TmpEntry(this, path, entry);
      }
    } else if (!onlyIfExists) {
      // It doesn't exist - make an empty entry to allow setting
      return new TmpEntry(this, path, null);
    }
  }
}

class TmpEntry {
  constructor(mount, path, existing) {
    this.mount = mount;
    this.path = path;
    this.existing = existing;
  }

  get() {
    const innerEntry = this.existing || this.mount.getEntry(this.path, true);
    if (innerEntry) {
      return innerEntry.get();
    }
    throw new Error(`tmp-ns entry ${this.path} has no value, thus isn't gettable`);
  }

  invoke(input) {
    const innerEntry = this.existing || this.mount.getEntry(this.path, true);
    if (innerEntry) {
      return innerEntry.invoke(input);
    }
    throw new Error(`tmp-ns entry ${this.path} has no value, thus isn't invokable`);
  }

  put(value) {
    console.log('putting', this.path, value);
    return this.mount.entries.set(this.path, value);

    this.existing = value; // TODO: lol?
  }
}
