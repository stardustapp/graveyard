class WebFilesystemMount {
  constructor(opts) {
    console.log('web filesystem inited with', opts);

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
          const reader = d.createReader();
          let entries = [];
          return new Promise((resolve, reject) => {
            const getEntries = function() {
              reader.readEntries(results => {
                if (results.length) {
                  entries = entries.concat(results);
                  getEntries();
                } else {
                  resolve({d, entries});
                }
              }, reject);
            };
            getEntries();
          });
        }).then(({d, entries}) => {
          return new FolderLiteral(d.name, entries.map(e => {
            if (e.isDirectory) return new FolderLiteral(e.name);
            if (e.isFile) return new StringLiteral(e.name);
          }));
        }, err => {
          if (err.name === 'NotFoundError')
            return null;
          return err;
        });
    } else {
      return await new Promise((resolve, reject) =>
          this.entry.getFile(this.prefix+subPath, {create: false}, resolve, reject))
        .then(f => {
          return new Promise((resolve, reject) =>
            f.file(file => resolve({f, file}), reject));
        })
        .then(({f, file}) => {
          var reader = new FileReader();
          return new Promise((resolve, reject) => {
            reader.onloadend = function(e) {
              if (this.error) {
                reject(this.error);
              } else {
                const dataIdx = this.result.indexOf(',')+1;
                resolve(new BlobLiteral(f.name, this.result.slice(dataIdx), file.type));
              }
            };
            reader.readAsDataURL(file);
          });
        }, err => {
          if (err.name === 'NotFoundError')
            return null;
          return err;
        });
    }
  }
}