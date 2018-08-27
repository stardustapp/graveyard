class ImportedSkylinkDevice {
  constructor(remote, pathPrefix) {
    this.remote = remote;
    this.pathPrefix = pathPrefix;

    // copy promise from remote
    this.ready = remote.ready;
  }

  getEntry(path) {
    return new ImportedSkylinkEntry(this.remote, this.pathPrefix + path);
  }

  getSubRoot(path) {
    if (path === '') return this;
    return new ImportedSkylinkDevice(this.remote, this.pathPrefix + path);
  }

  static fromUri(uri) {
    const parts = uri.slice('skylink+'.length).split('/');
    const scheme = parts[0].slice(0, -1);
    const endpoint = parts.slice(0, 3).join('/') + '/~~export' + (scheme.startsWith('ws') ? '/ws' : '');
    const remotePrefix = ('/' + parts.slice(3).join('/')).replace(/\/+$/, '');

    if (scheme.startsWith('http')) {
      const skylink = new StatelessHttpSkylinkClient(endpoint);
      return new ImportedSkylinkDevice(skylink, remotePrefix);

    } else if (scheme.startsWith('ws')) {
      const skylink = new WebsocketSkylinkClient(endpoint);
      return new ImportedSkylinkDevice(skylink, remotePrefix);

    } else {
      throw new Error(`BUG: Tried importing a skylink of unknown scheme ${scheme}`);
    }
  }
}

class ImportedSkylinkEntry {
  constructor(remote, path) {
    this.remote = remote;
    this.path = path;
  }

  async get() {
    const response = await this.remote.volley({
      Op: 'get',
      Path: this.path,
    });
    if (!response.Ok) throw response;
    return response.Output;
  }

  async enumerate(enumer) {
    const response = await this.remote.volley({
      Op: 'enumerate',
      Path: this.path||'/',
      Depth: enumer.remainingDepth(),
    });
    if (!response.Ok) throw response;

    // transclude the remote enumeration
    enumer.visitEnumeration(response.Output);
  }

  async put(value) {
    const response = await this.remote.volley((value === null) ? {
      Op: 'unlink',
      Path: this.path,
    } : {
      Op: 'store',
      Dest: this.path,
      Input: value,
    });
    if (!response.Ok) throw response;
  }

  async invoke(value) {
    const response = await this.remote.volley({
      Op: 'invoke',
      Path: this.path,
      Input: value,
    });
    if (!response.Ok) throw response;
    return response.Output;
  }

/*
  async subscribe(depth, newChan) {
    const response = await this.remote.volley({
      Op: 'subscribe',
      Path: this.path,
      Depth: depth,
    });
    return response.Output;
  }
*/
}
