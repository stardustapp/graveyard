class Workload {
  constructor(record, session) {
    this.record = record;
    this.session = session;
  }
}

class DaemonWorkload extends Workload {
  constructor(record, session) {
    super(record, session);
    console.warn('------- DAEMON UP:', record.spec.displayName);
    this.ready = this.init();
  }

  async init() {
    const {wid, wlKey, spec} = this.record;

    this.worker = new RuntimeWorker(spec.runtime);
    const fd = await this.worker.bindFd(this.session.env);
    const response = await this.worker
      .invokeApi('start workload', {
        wid, spec,
        basePath: fd+'/mnt',
      });
    console.log('worker started:', response);
  }

  async stop(reason) {
    const {wid} = this.record;
    const response = await this.worker
      .invokeApi('stop workload', {wid, reason});
    console.log('worker stopped:', response);
  }
}

class RuntimeWorker extends Worker {
  constructor(runtimeName) {
    super(`daemon/runtimes/${runtimeName}.js`);
    this.runtimeName = runtimeName;

    this.onmessage = this.handleMessage.bind(this);

    this.env = new Environment();
    this.nsExport = new NsExport(this.env);
    this.nextFd = 1;

    this.pendingIds = new Map;
    this.nextId = 1;
  }

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