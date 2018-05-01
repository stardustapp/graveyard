class TemporaryMount {
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

  async getEntry(path, onlyIfExists=false) {
    const {entry, subPath} = this.matchPath(path);
    if (entry) {
      if (subPath) {
        if (!entry.getEntry) {
          throw new Error(`tmp-ns path "${path}" isn't pathable`);
        }
        const innerEntry = await entry.getEntry(subPath);
        if (!onlyIfExists || innerEntry) {
          return new TmpEntry(this, path, innerEntry);
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

  async get() {
    const innerEntry = this.existing || await this.mount.getEntry(this.path, true);
    if (innerEntry) {
      return innerEntry.get();
    }
    throw new Error(`tmp-ns entry ${this.path} has no value, thus isn't gettable`);
  }

  async invoke(input) {
    const innerEntry = this.existing || this.mount.getEntry(this.path, true);
    if (!innerEntry) {
      throw new Error(`tmp-ns entry ${this.path} has no value, thus isn't invokable`);
    } else if (innerEntry.invoke) {
      return await innerEntry.invoke(input);
    } else {
      throw new Error(`tmp-ns entry ${this.path} exists but is not invokable`);
    }
  }

  async put(value) {
    console.log('putting', this.path, value);
    this.existing = value; // TODO: lol?
    return this.mount.entries.set(this.path, value);
  }
}
