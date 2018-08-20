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

  getEntry(path) {
    const subPath = path.slice(1);
    // Try as directory first, fallback to file
    return new Promise((resolve, reject) =>
        this.entry.getDirectory(this.prefix+subPath, {create: false}, resolve, reject))
      .then(d => new WebFsDirectoryEntry(d))
      .catch(err => {
        if (err.name === 'TypeMismatchError') {
          return new Promise((resolve, reject) =>
              this.entry.getFile(this.prefix+subPath, {create: false}, resolve, reject))
            .then(f => new WebFsFileEntry(f));
        }
        return Promise.reject(err);
      })
      .catch(err => {
        if (err.name === 'NotFoundError')
          return null;
        return Promise.reject(err);
      });
  }
}

class WebFsDirectoryEntry {
  constructor(entry) {
    this.entry = entry;
  }

  async forEachChildEntry(cb) {
    const reader = this.entry.createReader();
    return new Promise((resolve, reject) => {
      function getEntries() {
        reader.readEntries(async results => {
          if (!results.length)
            return resolve();
          for (const entry of results)
            await cb(entry);
          getEntries();
        }, reject);
      };
      getEntries();
    });
  }

  async get() {
    const children = new Array;
    await this.forEachChildEntry(e => {
      if (e.isDirectory) {
        children.push(new FolderLiteral(e.name));
      }
      if (e.isFile) {
        children.push(new BlobLiteral(e.name));
      }
    });
    return new FolderLiteral(this.entry.name, children);
  }

  async enumerate(enumer) {
    enumer.visit({Type: 'Folder'});
    if (!enumer.canDescend()) return;

    await this.forEachChildEntry(async e => {
      enumer.descend(e.name);
      if (e.isDirectory) {
        if (enumer.canDescend()) {
          // Simple recursion if desired
          const child = new WebFsDirectoryEntry(e);
          await child.enumerate(enumer);
        } else {
          enumer.visit(new FolderLiteral(e.name));
        }
      }
      if (e.isFile) {
        enumer.visit(new BlobLiteral());
      }
      enumer.ascend();
    });
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

    const mimeType = file.type ? file.type
      : typeGuesses[this.entry.name.split('.').slice(-1)[0]];
    return new BlobLiteral(this.entry.name, base64, mimeType);
  }

  async put(entry) {
    const dataUrl = `data:${entry.Mime};base64,${entry.Data}`;
    const blobFetch = await fetch(dataUrl);
    const realBlob = await blobFetch.blob();

    const writer = await new Promise((resolve, reject) =>
      this.entry.createWriter(resolve, reject));

    await new Promise((resolve, reject) => {
      writer.onwriteend = function(evt) {
        // TODO: errors supposedly via .onerror=evt=>{}
        if (this.error)
          return reject(this.error);
        resolve();
      };
      writer.write(realBlob);
    });
  }
}

const typeGuesses = {
  'lua': 'text/x-lua',
};