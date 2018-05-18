const SERVER_HEADER = 'Chrome-'+chrome.runtime.getManifest().short_name+'/'+chrome.runtime.getManifest().version;

class NsExport {
  constructor(namespace) {
    this.namespace = namespace;
  }

  inflateInput(raw) {
    if (!raw) {
      return null;
    }
    if (raw.constructor !== Object) {
      throw new Error(`Raw nsapi Input wasn't an Object, please read the docs`);
    }
    if (!raw.Type) {
      throw new Error(`Raw nsapi Input didn't have a Type, please check your payload`);
    }
    switch (raw.Type) {

      case 'String':
        return new StringLiteral(raw.Name || 'input', raw.StringValue);

      case 'Folder':
        const folder = new FolderLiteral(raw.Name || 'input');
        (raw.Children || []).forEach(child => {
          folder.append(this.inflateInput(child))
        });
        return folder;

      default:
        throw new Error(`nsapi Input had unimpl Type ${raw.Type}`);
    }
  }

  async processOp(request, namespace=this.namespace) {
    const Op = request.Op || request.op;
    const Path = request.Path || request.path;
    const Dest = request.Dest || request.dest;

    const Input = this.inflateInput(request.Input || request.input);
    console.log('--> inbound operation:', Op, Path, Dest);

    switch (Op) {
      case 'ping':
        return;

      case 'get':
        var entry = await namespace.getEntry(Path);
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.get) {
          return await entry.get();
        } else {
          throw new Error(`Entry at ${Path} isn't gettable`);
        }

      case 'store':
        var entry = await namespace.getEntry(Dest);
        if (!entry) {
          throw new Error(`Path not found: ${Dest}`);
        } else if (entry.put) {
          return await entry.put(Input);
        } else {
          throw new Error(`Entry at ${Dest} isn't puttable`);
        }

      case 'enumerate':
        var entry = await namespace.getEntry(Path);
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.enumerate) {
          const enumer = new EnumerationWriter(request.Depth || request.depth);
          await entry.enumerate(enumer);
          return enumer.toOutput();
        } else {
          throw new Error(`Entry at ${Path} isn't enumerable`);
        }

      case 'subscribe':
        // get the channel constructor, we'll want it
        const newChan = await namespace.getEntry('/channels/new/invoke');
        if (!newChan || !newChan.invoke) {
          throw new Error(`Transport doesn't support channels, cannot subscribe`);
        }

        var entry = await namespace.getEntry(Path);
        var depth = request.Depth || request.depth;
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.subscribe) {
          return await entry.subscribe(depth, newChan);
        } else if (entry.enumerate) {
          return await EnumerateIntoSubscription(entry.enumerate, depth, newChan);
        } else {
          throw new Error(`Entry at ${Path} isn't subscribable`);
        }

      case 'invoke':
        var entry = await namespace.getEntry(Path);
        var output;
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.invoke) {
          output = await entry.invoke(Input);
        } else {
          throw new Error(`Entry at ${Path} isn't invokable`);
        }

        // if Dest, store the rich output in the tree
        if (Dest) {
          var outEntry = await namespace.getEntry(Dest);
          if (!outEntry) {
            throw new Error(`Dest path not found: ${Dest}`);
          } else if (outEntry.put) {
            await outEntry.put(output);
          } else if (outEntry) {
            throw new Error(`Dest entry at ${Dest} isn't puttable`);
          }
          return;
        } else if (output.get) {
          // otherwise just return a flattened output
          return await output.get();
        } else if (output) {
          throw new Error(`Output of ${Path} isn't gettable, please use Dest`);
        }

      default:
        throw new Error(`Server doesn't implement ${Op} operation`);
    }
  }

  startServer(port=9237) {
    this.webServer = new WSC.WebApplication({
      host: '0.0.0.0',
      port: port,
      handlers: [
        ['^/~~export$', SkylinkPostHandler.bind(null, this)],
        ['^/~~export/ws$', SkylinkWebsocketHandler.bind(null, this)],
        ['^/~~export/ping$', SkylinkPingHandler],
      ],
    });
    this.webServer.start();
    console.log('listening on %s', this.webServer.port);
  }
}

class SkylinkPostHandler extends WSC.BaseHandler {
  constructor(nsExport) {
    super();
    this.nsExport = nsExport;
  }

  sendResponse(data) {
    const payload = JSON.stringify(data);

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(200);
    this.write(payload);
    this.finish();
  }

  post(path) {
    // Parse up the submitted JSON
    var body = JSON.parse(
      String.fromCharCode.apply(null,
        new Uint8Array(this.request.body)));

    const send = (ok, output) => {
      console.log('<-- op was', ok ? 'okay' : 'not ok');
      this.sendResponse({
        Ok: ok,
        Output: output,
      });
    };

    this.nsExport.processOp(body).then(output => {
      send(true, output);
    }, (err) => {
      console.warn('!!! Operation failed with', err);
      send(false, {
        Type: 'String',
        Name: 'error-message',
        StringValue: err.message,
      });
    });
  }
}

class SkylinkWebsocketHandler extends WSC.WebSocketHandler {
  constructor(nsExport) {
    super();
    this.nsExport = nsExport;

    // create a new environment just for this connection
    this.localEnv = new Environment();
    this.localEnv.mount('/tmp', 'tmp');
    this.localEnv.bind('/pub', nsExport.namespace); // TODO: prefix /api

    this.channels = new Map;
    this.nextChan = 1;

    this.isActive = false;
    this.reqQueue = new Array;
  }

  sendJson(body) {
    this.write_message(JSON.stringify(body));
  }

  // Given a function that gets passed a newly-allocated channel
  async newChannelFunc(input) {
    const chanId = this.nextChan++;
    const channel = {
      channelId: chanId,
      sendJson: this.sendJson.bind(this),
      start() {
        input(this);
      },
      next(value) {
        this.sendJson({
          Status: 'Next',
          Chan: chanId,
          Output: value,
        });
      },
      stop(message) {
        this.sendJson({
          Status: 'Stop',
          Chan: chanId,
          Output: message,
        });
      },
    }
    this.channels.set(chanId, channel);
    return channel;
  }

  sendOutput(ok, output) {
    console.log('<-- op was', ok ? 'okay' : 'not ok');
    this.sendJson({
      Ok: ok,
      Output: output,
    });
  }

  // These functions are invoked by the websocket processor
  open() {
    console.log('ws open', this);

    // offer async response follow-ups with channels
    // mount in env for processing code
    const channels = new Map();
    var nextChan = 1;
    this.localEnv.mount('/channels/new', 'function', {
      invoke: this.newChannelFunc.bind(this),
    });
  }
  on_message(msg) {
    var request = JSON.parse(msg);
    console.log('got ws message', request);
    if (this.isActive) {
      this.reqQueue.push(request);
    } else {
      this.isActive = true;
      this.processRequest(request);
    }
  }
  on_close() {
    console.log('ws closed');
    // TODO: shut down session
  }

  processRequest(request) {
    this.nsExport.processOp(request, this.localEnv).then(output => {
      if (output && output.channelId) {
        this.sendJson({
          Ok: true,
          Status: 'Ok',
          Chan: output.channelId,
        });
        output.start();
      } else {
        this.sendOutput(true, output);
      }

    }, (err) => {
      const stackSnip = err.stack.split('\n').slice(0,4).join('\n');
      console.warn('!!! Operation failed with', stackSnip);
      this.sendOutput(false, {
        Type: 'String',
        Name: 'error-message',
        StringValue: err.message,
      });
    }).then(() => {
      // we're done with the req, move on
      if (this.reqQueue.length) {
        this.processRequest(this.reqQueue.shift());
      } else {
        this.isActive = false;
      }
    });
  }
  
}

class SkylinkPingHandler extends WSC.BaseHandler {
  constructor() {
    super();
  }

  get(path) {
    const payload = JSON.stringify({Ok: true});

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(200);
    this.write(payload);
    this.finish();
  }
}
