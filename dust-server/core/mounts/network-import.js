class NetworkImportMount {
  constructor(opts) {
    if (!opts.url) {
      throw new Error(`network-import mounts require at least a url`);
    }
    if (!opts.url.startsWith('http')) {
      throw new Error(`network-import does not support websocket yet`);
    }

    this.url = opts.url;
  }

  async getEntry(path) {
    return new ImportedEntry(this, path);
  }
}

class ImportedEntry {
  constructor(mount, path) {
    this.mount = mount;
    this.path = path;
  }

  async get() {

  }

  async invoke(input) {
    console.log(this, input);
  }

  async put(value) {

  }

  async subscribe(newChannel) {

  }

  //async enumerate(enumer) {
  //}
}
