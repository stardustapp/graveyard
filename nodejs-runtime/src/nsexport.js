const restify = require('restify');
const {Watershed} = require('watershed');

const {Environment} = require('./environment');

exports.NsExport = class NsExport {
  constructor(namespace) {
    this.namespace = namespace;

    this.configureServer();
    this.ws = new Watershed();
  }

  processOp(request, namespace=this.namespace) {
    const {Op, Path, Dest, Input} = request;
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

      case 'enumerate':
        var entry = namespace.getEntry(Path);
        if (entry.enumerate) {
          return entry.enumerate(Input);
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't enumerable`);
        } else {
          throw new Error(`Path not found: ${Path}`);
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
          send(true, output);

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
