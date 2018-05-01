class FsStringDictMount {
  constructor(opts) {
    this.fsRoot = opts.fsRoot;
    this.verifyRoot();
  }

  verifyRoot() {
    try {
      const rootStat = fs.stat.sync(fs, this.fsRoot);
      if (!rootStat.isDirectory()) {
        throw new Error(`fs-string-dict root at ${this.fsRoot} exists, but wasn't a Directory`);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('Creating new string-dict FS root at', this.fsRoot);
        fs.mkdir.sync(fs, this.fsRoot);
        return;
      }
      throw err;
    }
  }

  async getEntry(pathStr) {
    if (pathStr.length < 2) {
      return new FsRootEntry(this);
    }

    const parts = pathStr.slice(1).split('/');
    if (parts.length == 1) {
      return new FsStringEntry(path.join(this.fsRoot, pathStr) + '.txt');
    }
  }
};

class FsRootEntry {
  constructor(mount) {
    this.mount = mount;
  }

  async enumerate() {
    return this.mount.listKeys();
  }
}

class FsStringEntry {
  constructor(osPath, name) {
    this.osPath = osPath;
    this.name = name;
  }

  get() {
    try {
      const fileContents = fs.readFile.sync(fs, this.osPath, {
        encoding: 'UTF-8',
      });
      return new StringLiteral(this.name, fileContents);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('WARN: fs-string-entry get() ignoring ENOENT on', this.osPath);
        return '';
      }
      throw err;
    }
  }

  put(val) {
    if (val && (val.StringValue !== null) && val.StringValue.constructor === String) {
      fs.writeFile.sync(fs, this.osPath, val.StringValue, {
        encoding: 'UTF-8',
      });
      return;
    }
    throw new Error(`fs-string-entry put() called with non-StringLiteral: ${JSON.stringify(val)}`);
  }
}
