// This file contains bindings to the host's actual filesystem, via Chrome APIs.
// It presents a crippled view with very reduced functionality.
// This is optimized for storing... well, not much, really.
// The Web APIs used within are documented on MDN and various sites,
//   but only Chrome is maintaining an implementation of the folder-based ones.

class WebFilesystemMount {
  constructor(opts) {
    this.entry = opts.entry;
    this.prefix = opts.prefix || '';
    if (!this.entry.getDirectory) {
      throw new Error(`WebFilesystemMount given entry without getDirectory()`);
    }

    //this.api = DirectoryEntryApi.construct(this.root);
  }

  async getEntry(path) {
    const subPath = path.slice(1);
    // Use trailing slash to signal for a directory instead
    // TODO: how annoying is that?
    if (path.endsWith('/')) {
      return await new Promise((resolve, reject) =>
          this.entry.getDirectory(this.prefix+subPath, {create: false}, resolve, reject))
        .then(d => {
          return new WebFsDirectoryEntry(d)
        }, err => {
          if (err.name === 'NotFoundError')
            return null;
          return err;
        });
    } else {
      return await new Promise((resolve, reject) =>
          this.entry.getFile(this.prefix+subPath, {create: false}, resolve, reject))
        .then(f => {
          return new WebFsFileEntry(f)
        }, err => {
          if (err.name === 'NotFoundError')
            return null;
          return err;
        });
    }
  }
}

class WebFsDirectoryEntry {
  constructor(entry) {
    this.entry = entry;
  }

  async get() {
    const reader = this.entry.createReader();
    const entries = await new Promise((resolve, reject) => {
      let entries = [];
      const getEntries = function() {
        reader.readEntries(results => {
          if (!results.length)
            return resolve(entries);
          entries = entries.concat(results);
          getEntries();
        }, reject);
      };
      getEntries();
    });

    const children = entries.map(e => {
      if (e.isDirectory) return new FolderLiteral(e.name);
      if (e.isFile) return new StringLiteral(e.name);
    });
    return new FolderLiteral(this.entry.name, children);
  }
}

class WebFsFileEntry {
  constructor(entry) {
    this.entry = entry;
  }

  async get() {
    const file = await new Promise((resolve, reject) =>
      this.entry.file(resolve, reject));

    var reader = new FileReader();
    const base64 = await new Promise((resolve, reject) => {
      reader.onloadend = function(evt) {
        if (this.error)
          return reject(this.error);
        const dataIdx = this.result.indexOf(',')+1;
        resolve(this.result.slice(dataIdx));
      };
      reader.readAsDataURL(file);
    });
    return new BlobLiteral(this.entry.name, base64, file.type)
  }
}