var clients = require('restify-clients');

exports.NetworkImportMount = class NetworkImportMount {
  constructor(opts) {
    if (!opts.url) {
      throw new Error(`network-import mounts require at least a url`);
    }
    if (!opts.url.startsWith('http')) {
      throw new Error(`network-import does not support websocket yet`);
    }

    this.url = opts.url;
    this.client = clients.createJsonClient({
      url: opts.url,
    });
  }

  getEntry(path) {
    return new ImportedEntry(this, path);
  }
}

class ImportedEntry {
  constructor(mount, path) {
    this.mount = mount;
    this.path = path;
  }

  get() {

  }

  invoke(input) {
    console.log(this, input);
  }

  put(value) {

  }

  subscribe(newChannel) {

  }

  enumerate(input) {

  }
}
