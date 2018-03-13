const restify = require('restify');
const {Watershed} = require('watershed');

const {Environment} = require('./environment');
const {StringLiteral, FolderLiteral} = require('./api-entries');

exports.NsExport = class NsExport {
  constructor(namespace) {
    this.namespace = namespace;

    this.configureServer();
    this.ws = new Watershed();
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

  processOp(request, namespace=this.namespace) {
    const {Op, Path, Dest} = request;
    const Input = this.inflateInput(request.Input);
    console.log('--> inbound operation:', Op, Path, Dest);

    switch (Op) {
      case 'ping':
        return;

      case 'get':
        var entry = namespace.getEntry(Path);
        if (entry.get) {
          return entry.get();
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't gettable`);
        } else {
          throw new Error(`Path not found: ${Path}`);
        }

      case 'store':
        var entry = namespace.getEntry(Dest);
        if (entry.put) {
          return entry.put(Input);
        } else if (entry) {
          throw new Error(`Entry at ${Dest} isn't puttable`);
        } else {
          throw new Error(`Path not found: ${Dest}`);
        }

      case 'enumerate':
        var entry = namespace.getEntry(Path);
        if (entry.enumerate) {
          return entry.enumerate(Input);
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't enumerable`);
        } else {
          throw new Error(`Path not found: ${Path}`);
        }

      case 'subscribe':
        // get the channel constructor, we'll want it
        const newChan = namespace.getEntry('/channels/new/invoke');
        if (!newChan || !newChan.invoke) {
          throw new Error(`Transport doesn't support channels, cannot subscribe`);
        }

        var entry = namespace.getEntry(Path);
        if (entry.subscribe) {
          return entry.subscribe(newChan);
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't subscribable`);
        }

      case 'invoke':
        var entry = namespace.getEntry(Path);
        var output;
        if (entry.invoke) {
          output = entry.invoke(Input);
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't invokable`);
        } else {
          throw new Error(`Path not found: ${Path}`);
        }

        // if Dest, store the rich output in the tree
        if (Dest) {
          var outEntry = namespace.getEntry(Dest);
          if (outEntry.put) {
            outEntry.put(output);
            return;
          } else if (outEntry) {
            throw new Error(`Dest entry at ${Dest} isn't puttable`);
          } else {
            throw new Error(`Dest path not found: ${Dest}`);
          }
        } else if (output.get) {
          // otherwise just return a flattened output
          return output.get();
        } else if (output) {
          throw new Error(`Output of ${Path} isn't gettable, please use Dest`);
        }

      default:
        throw new Error(`Server doesn't implement ${Op} operation`);
    }
  }

  configureServer() {
    this.server = restify.createServer({
      name: 'stardust-nodejs-runtime',
      handleUpgrades: true,
    });
    this.server.use(restify.plugins.bodyParser());

    this.server.post('/~~export', (req, res, next) => {
      const send = (ok, output) => {
        console.log('<-- op was', ok ? 'okay' : 'not ok');
        res.send(200, {
          Ok: ok,
          Output: output,
        });
        return next();
      };

      try {
        const output = this.processOp(req.body);
        send(true, output);

      } catch (err) {
        console.log('!!! Operation failed with', err.message);
        send(false, {
          Type: 'String',
          Name: 'error-message',
          StringValue: err.message,
        });
      }
    });

    this.server.get('/~~export/ws', (req, res, next) => {
      console.log('==> upgrading inbound request to a websocket')
      if (!res.claimUpgrade) {
        next(new Error('Connection must upgrade for websockets'));
        return;
      }

      var upgrade = res.claimUpgrade();
      var shed = this.ws.accept(req, upgrade.socket, upgrade.head);

      // create a new environment just for this connection
      const localEnv = new Environment();
      localEnv.mount('/tmp', 'tmp');
      localEnv.mount('/pub', 'bind', {
        source: this.namespace, // TODO: prefix /api
      });

      // offer async response follow-ups with channels
      // mount in env for processing code
      const channels = new Map();
      var nextChan = 1;
      localEnv.mount('/channels/new', 'function', { invoke(input) {
        const chanId = nextChan++;
        const channel = {
          channelId: ''+chanId,
          start() {
            input(this);
          },
          next(value) {
            shed.send(JSON.stringify({
              Status: 'Next',
              Chan: ''+chanId,
              Output: value,
            }));
          },
          stop(message) {
            shed.send(JSON.stringify({
              Status: 'Stop',
              Chan: ''+chanId,
              Output: message,
            }));
          },
        }
        channels.set(''+chanId, channel);
        return channel;
      }});

      const send = (ok, output) => {
        console.log('<-- op was', ok ? 'okay' : 'not ok');
        shed.send(JSON.stringify({
          Ok: ok,
          Output: output,
        }));
      };

      shed.on('text', (msg) => {
        const request = JSON.parse(msg);
        try {
          const output = this.processOp(request, localEnv);
          if (output && output.channelId) {
            shed.send(JSON.stringify({
              Ok: true,
              Status: 'Ok',
              Chan: output.channelId,
            }));
            output.start();
          } else {
            send(true, output);
          }

        } catch (err) {
          const stackSnip = err.stack.split('\n').slice(0,4).join('\n');
          console.log('!!! Operation failed with', stackSnip);
          send(false, {
            Type: 'String',
            Name: 'error-message',
            StringValue: err.message,
          });
        }
      });

      next(false);
    });
  }

  listen(port=9234) {
    this.port = port;
    this.server.listen.sync(this.server, port);
    console.log('%s listening at %s', this.server.name, this.server.url);
  }
}
