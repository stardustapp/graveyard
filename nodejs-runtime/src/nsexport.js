const restify = require('restify');
const {Watershed} = require('watershed');

exports.NsExport = class NsExport {
  constructor(namespace) {
    this.namespace = namespace;
    this.configureServer();
  }

  processOp(request) {
    const {Op, Path, Dest, Input} = request;
    console.log('--> inbound operation:', Op, Path, Dest);

    switch (Op) {
      case 'ping':
        return;

      case 'get':
        const entry = this.namespace.getEntry(Path);
        if (entry.get) {
          return entry.get();
        } else if (entry) {
          throw new Error(`Entry at ${Path} isn't gettable`);
        } else {
          throw new Error(`Path not found: ${Path}`);
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

    var ws = new Watershed();
    this.server.get('/~~export/ws', (req, res, next) => {
      console.log('upgrading socket')
      if (!res.claimUpgrade) {
        next(new Error('Connection Must Upgrade For WebSockets'));
        return;
      }

      var upgrade = res.claimUpgrade();
      var shed = ws.accept(req, upgrade.socket, upgrade.head);

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
          const output = this.processOp(request);
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
