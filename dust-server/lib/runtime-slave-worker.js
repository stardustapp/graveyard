class RuntimeSlaveWorker {
  constructor(apiSetup) {
    onmessage = this.handleKernelMessage.bind(this);

    this.pendingIds = new Map;
    this.nextId = 1;

    this.api = new Map;
    apiSetup(this.api);
  }

  async handleKernelMessage({data, ports}) {
    const {Op, Path, Id, Input, Ok} = data;

    if (Op) {
      // kernel is performing an operation on us
      (async () => {
        console.debug('Message received from main script', Op, Path);

        if (Op === 'invoke' && Path.startsWith('/api/')) {
          const apiName = Path.slice(5);
          if (this.api.has(apiName)) {
            const apiImpl = this.api.get(apiName);
            return {
              Type: 'JS',
              Data: await apiImpl(Input.Data),
            };
          } else {
            throw new Error(`You invoked unexpected path ${JSON.stringify(Path)}`);
          }

        } else if (Op === 'ping') {
          return {};

        } else {
          throw new Error(`BUG: Invoked unimplemented Skylink Op ${JSON.stringify(Op)}`);
        }
      })().then(out => {
        return {
          Ok: true,
          Id: Id,
          Output: out || null,
        };
      }, err => {
        console.warn('Passing failure back to kernel', err, 'for', data);
        return {
          Ok: false,
          Id: Id,
          Output: {
            Type: 'Error',
            StringValue: err.stack,
          },
        };
      }).then(x => {
        postMessage(x);
      });

    } else if (this.pendingIds.has(Id)) {
      const future = this.pendingIds.get(Id);
      this.pendingIds.delete(Id);
      if ('Chan' in data) {
        const channel = new KernelChannel(this, data.Chan, ports[0]);
        data.Output = {
          channel: channel.map(entryToJS),
          stop: channel.stop.bind(channel),
        };
      }
      future.resolve(data);

    } else {
      throw new Error(`BUG: wat 7634634`);
    }
  }

  // duplicated with daemon/model/workload.js
  async volley(request) {
    request.Id = this.nextId++;
    const response = await new Promise(resolve => {
      this.pendingIds.set(request.Id, {request, resolve});
      postMessage(request);
    });

    if (response.Ok) {
      //console.debug('Kernel response was ok:', response);
      return response;
    } else {
      const output = response.Output || {};
      let error;
      if (output.Type === 'Error') {
        const justMessage = output.Type === 'Error' ?
            output.StringValue.split('\n')[0].split(': ')[1] : '';
        throw new Error(`(kernel) ${justMessage}`);
      } else if (output.Name === 'error-message' && output.Type === 'String') {
        throw new Error(`(kernel) ${output.StringValue}`);
      } else {
        throw new Error(`Kernel message wasn't okay`);
      }
    };
  }

  deviceForKernelPath(path) {
    return new KernelPathDevice(this, path);
  }
}

class KernelChannel extends Channel {
  constructor(worker, chanId, port) {
    super(chanId);
    this.worker = worker;
    this.chanId = chanId;
    this.port = port;

    port.onmessage = evt => {
      this.route(evt.data);
    };
  }

  stop() {
    console.log('skylink Requesting stop of chan', this.chanId);
    return this.worker.volley({
      Op: 'stop',
      Path: '/chan/'+this.chanId,
    });
  }
}

class KernelPathDevice {
  constructor(runtime, pathPrefix) {
    this.runtime = runtime;
    this.pathPrefix = pathPrefix;
  }

  async getEntry(path) {
    return new KernelPathEntry(this.runtime, this.pathPrefix + path);
  }

  getSubRoot(path) {
    if (path === '') return this;
    return new KernelPathDevice(this.runtime, this.pathPrefix + path);
  }
}

class KernelPathEntry {
  constructor(runtime, path) {
    this.runtime = runtime;
    this.path = path;
  }

  async get() {
    const response = await this.runtime.volley({
      Op: 'get',
      Path: this.path,
    });
    return response.Output;
  }

  async enumerate(enumer) {
    const response = await this.runtime.volley({
      Op: 'enumerate',
      Path: this.path,
      Depth: enumer.depth,
    });

    // TODO: not a good citizen
    response.Output.Children.forEach(child => {
      enumer.entries.push(child);
    });
  }

  async put(value) {
    const response = await this.runtime.volley({
      Op: 'store',
      Dest: this.path,
      Input: value,
    });
    return response.Ok;
  }

  async invoke(value) {
    const response = await this.runtime.volley({
      Op: 'invoke',
      Path: this.path,
      Input: value,
    });
    return response.Output;
  }

  async subscribe(depth, newChan) {
    const response = await this.runtime.volley({
      Op: 'subscribe',
      Path: this.path,
      Depth: depth,
    });
    return response.Output;
  }
}
