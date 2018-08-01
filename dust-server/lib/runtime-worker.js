class RuntimeWorker extends Worker {
  constructor(runtimeName, threadName=`${runtimeName} runtime`) {
    super(`daemon/runtimes/${runtimeName}.js`, {name: threadName});
    this.runtimeName = runtimeName;

    this.onmessage = this.handleMessage.bind(this);

    this.env = new Environment();
    this.nsExport = new NsExport(this.env);
    this.nextFd = 1;

    this.pendingIds = new Map;
    this.nextId = 1;
  }

  // Expose a specific environment to the runtime by opening an FD
  async bindFd(target) {
    const fd = `/fd/${this.nextFd++}`;
    await this.env.bind(fd, target);
    return fd;
  }

  handleMessage(evt) {
    const {Id, Ok, Op} = evt.data;
    if (Op) {
      this.processRuntimeOp(evt.data);
    } else if (this.pendingIds.has(Id)) {
      const future = this.pendingIds.get(Id);
      this.pendingIds.delete(Id);
      future.resolve(evt.data);
    } else {
      throw new Error(`BUG: kernel got message for non-pending thing`);
    }
  }

  processRuntimeOp(request) {
    this.nsExport
      .processOp(request)
      .then(output => {
        this.postMessage({
          Ok: true,
          Id: request.Id,
          Output: output,
        });
      }, (err) => {
        console.warn('!!! Kernel syscall failed with', err);
        this.postMessage({
          Ok: false,
          Id: request.Id,
          Output: {
            Type: 'String',
            Name: 'error-message',
            StringValue: err.message,
          },
        });
      });
  }

  async volley(request) {
    request.Id = this.nextId++;

    // send request and await response
    const response = await new Promise(resolve => {
      this.pendingIds.set(request.Id, {request, resolve});
      this.postMessage(request);
    });

    if (response.Op) {
      throw new Error(`huh`);
    } else if (response.Ok) {
      console.debug('RuntimeWorker response was ok:', response);
      return response;
    } else {
      const output = response.Output || {};
      let error;
      if (output.Type === 'Error') {
        const justMessage = output.Type === 'Error' ?
            output.StringValue.split('\n')[0].split(': ')[1] : '';
        throw new Error(`(in ${this.runtimeName} runtime) ${justMessage}`);
      } else {
        throw new Error(`Runtime message wasn't okay`);
      }
    };
  }

  async invokeApi(path, input) {
    const response = await this.volley({
      Op: 'invoke',
      Path: '/api/'+path,
      Input: {
        Type: 'JS',
        Data: input,
      }
    });
    return response.Output.Data;
  }
}