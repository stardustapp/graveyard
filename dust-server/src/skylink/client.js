class SkylinkClient {
  constructor(performer) {
    this.performer = performer;
    this.waitingReceivers = new Array;

    // extension points
    this.outputDecoders = new Array;
    this.frameProcessors = new Array;
    this.shutdownHandlers = new Array;
  }

  attach(extension) {
    extension.attachTo(this);
  }

  decodeOutput(frame) {
    // let extensions decode custom framing
    for (const decoder of this.outputDecoders) {
      const result = decoder(output);
      if (result) return result;
    }

    // default to no transform
    return output;
  }

  handleShutdown(input) {
    for (const handler of this.shutdownHandlers) {
      handler(input);
    }
  }

  // by default, calls sendFrame() and queues for a processFrame() call
  // please either extend and replace, or integrate those two funcs so this impl works
  async volley(request) {
    this.sendFrame(request);
  }

  processFrame(frame) {
    // let extensions override the whole frame
    for (const processor of this.frameProcessors) {
      const result = processor(output);
      if (result) return;
    }

    const receiver = this.waitingReceivers.shift();
    if (!receiver)
      throw new Error('skylink received skylink payload without receiver');
    receiver.resolve(this.decodeOutput(d));
  }
}

class StatelessHttpSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super(this.exec.bind(this));
    this.endpoint = endpoint;
  }

  async volley(request) {
    const resp = await fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify(request),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (resp.status < 200 || resp.status >= 300)
      throw new Error(`Skylink op failed with HTTP ${resp.status}`);
    return resp.json();
  }
}

class WebsocketSkylinkClient extends SkylinkClient {
  constructor(endpoint) {
    super(this.exec.bind(this));
    this.endpoint = endpoint;

    this.isLive = true;
    this.ready = this.init();
  }

  async init() {
    console.log(`Starting Skylink Websocket to ${this.endpoint}`);
    this.pingTimer = setInterval(() => this.exec({Op: 'ping'}), 30 * 1000);

    this.ws = new WebSocket(this.endpoint);
    this.ws.onmessage = msg => {
      const frame = JSON.parse(msg.data);
      this.processFrame(frame);
    };

    // wait for connection or failure
    try {
      await new Promise((resolve, reject) => {
        this.ws.onopen = resolve;
        this.ws.onclose = () => {
          reject('Skylink websocket has closed.'); // TODO: handle shutdown
          this.stop();
        };
        this.ws.onerror = err => {
          reject(new Error(`Skylink websocket has errored. ${err}`));
          this.stop(err);
        };
      });

    } catch (err) {
      // clean up after any error that comes before any open
      this.isLive = false;
      this.ws = null;

      throw err;
    }
  }

  stop(err) {
    if (this.ws) {
      console.log('Shutting down Websocket transport')
      clearInterval(this.pingTimer);
      this.ws.close();
    }

    const error = new Error(`Interrupted: Skylink WS transport was stopped`);
    this.waitingReceivers.forEach(x => {
      x.reject(error);
    });
    this.waitingReceivers.length = 0;

    this.handleShutdown(new StringLiteral('error', err.message));
  }

  exec(request) {
    return this.getConn()
      .then(() => new Promise((resolve, reject) => {
        this.waitingReceivers.push({resolve, reject});
        this.ws.send(JSON.stringify(request));
      }))
      .then(this.transformResp)
      .then(x => x, err => {
        if (typeof process === 'undefined' || process.argv.includes('-v'))
          console.warn('Failed netop:', request);
        return Promise.reject(err);
      });
  }

  // Chain after a json promise with .then()
  transformResp(obj) {
    if (!(obj.ok === true || obj.Ok === true || obj.Status === "Ok")) {
      //alert(`Stardust operation failed:\n\n${obj}`);
      this.stats.fails++;
      return Promise.reject(obj);
    }

    // detect channel creations and register them
    if (obj.Chan) {
      this.stats.chans++;
      //console.log('skylink creating channel', obj.Chan);
      const chan = new Channel(obj.Chan);
      this.channels[obj.Chan] = chan;
      return {
        channel: chan.map(entryToJS),
        stop: () => {
          console.log('skylink Requesting stop of chan', obj.Chan);
          return this.exec({
            Op: 'stop',
            Path: '/chan/'+obj.Chan,
          });
        },
      };
    }

    return obj;
  }
}
