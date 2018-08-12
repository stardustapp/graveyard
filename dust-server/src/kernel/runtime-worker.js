let openWorkerChannels = 0;
setInterval(() => {
  Datadog.Instance.gauge('skylink.channel.open_count', openWorkerChannels, {transport: 'worker'});
})

class RuntimeWorker extends Worker {
  constructor(runtimeName, threadName=`${runtimeName} runtime`) {
    super(`src/runtimes/${runtimeName}.js`, {name: threadName});
    this.runtimeName = runtimeName;

    this.onmessage = this.handleMessage.bind(this);

    this.env = new Environment();
    this.nsExport = new NsExport(this.env);
    this.nextFd = 1;

    this.pendingIds = new Map;
    this.nextId = 1;

    this.channels = new Map;
    this.nextChan = 1;

    this.env.mount('/channels/new', 'function', {
      invoke: this.newChannelFunc.bind(this),
    });
  }

  // Given a function that gets passed a newly-allocated channel
  async newChannelFunc(input) {
    Datadog.Instance.count('skylink.channel.opens', 1, {transport: 'worker'});
    openWorkerChannels++;
    const worker = this;

    const rawChannel = new MessageChannel;
    const chanId = this.nextChan++;
    const channel = {
      channelId: chanId,
      port1: rawChannel.port1,
      port2: rawChannel.port2,
      start() {
        input(this);
      },
      next(value) {
        this.port1.postMessage({
          Status: 'Next',
          Output: value,
        });
        Datadog.Instance.count('skylink.channel.packets', 1, {transport: 'worker', status: 'next'});
      },
      done() {
        this.port1.postMessage({
          Status: 'Done',
        });
        Datadog.Instance.count('skylink.channel.packets', 1, {transport: 'worker', status: 'done'});
        this.close();
      },
      error(value) {
        this.port1.postMessage({
          Status: 'Error',
          Output: value,
        });
        Datadog.Instance.count('skylink.channel.packets', 1, {transport: 'worker', status: 'error'});
        this.close();
      },
      close() {
        openWorkerChannels--;
        worker.channels.delete(chanId);
        this.port1.close();
      },
    }
    this.channels.set(chanId, channel);
    return channel;
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
        if (output && output.channelId) {
          // Transfer the second MessageChannel
          this.postMessage({
            Ok: true,
            Id: request.Id,
            Status: 'Ok',
            Chan: output.channelId,
          }, [output.port2]);
          output.start();
        } else {
          // Normal data packet
          this.postMessage({
            Ok: true,
            Id: request.Id,
            Output: output,
          });
        }
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
