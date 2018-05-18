const DirectoryEntryApi = new PlatformApi('web directory entry');
const FileEntryApi = new PlatformApi('web file entry');
[DirectoryEntryApi, FileEntryApi].forEach(api => api
  .getter('/is file', Boolean, () => this.inner.isFile)
  .getter('/is directory', Boolean, () => this.inner.isDirectory)
  .getter('/name', String, () => this.inner.name)
  .getter('/full path', String, () => this.inner.fullPath)
);

DirectoryEntryApi.function('/get directory', {
  input: {
    path: String,
    create: false,
    exclusive: false,
  },
  output: DirectoryEntryApi,
  impl({path, create, exclusive}) {
    return new Promise((resolve, reject) => {
      this.entry.getDirectory(path,
          {create, exclusive},
          ent => resolve(new DirectoryEntryApi(ent)),
          err => reject(err));
    });
  }
});
DirectoryEntryApi.function('/get file', {
  input: {
    path: String,
    create: false,
    exclusive: false,
  },
  output: FileEntryApi,
  impl({path, create, exclusive}) {
    return new Promise((resolve, reject) => {
      this.entry.getFile(path,
          {create, exclusive},
          ent => resolve(new FileEntryApi(ent)),
          err => reject(err));
    });
  }
});

class WebFilesystemMount {
  constructor(opts) {
    console.log('web filesystem inited with', opts);

    this.root = opts.root;
    if (!root.getDirectory) {
      throw new Error(`WebFilesystemMount given root without getDirectory()`);
    }

    this.api = DirectoryEntryApi.construct(this.root);
  }

  getEntry(path) {
    if (path.startsWith('/api')) {
      return this.api.getEntry(path.slice(4));
    }
  }
}