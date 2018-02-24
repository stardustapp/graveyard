const restify = require('restify');

exports.NsExport = class NsExport {
  constructor(namespace) {
    this.namespace = namespace;

    this.server = restify.createServer({
      name: 'stardust-nodejs-runtime',
    });
    this.server.use(restify.plugins.bodyParser());

    this.server.post('/~~export', (req, res, next) => {
      const send = (ok, output) => {
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
        console.log('==! Operation failed with', err.message);
        send(false, {
          Type: 'String',
          Name: 'error-message',
          StringValue: err.message,
        });
      }
    });
  }

  listen(port=9234) {
    this.port = port;
    this.server.listen(port, () => {
      console.log('%s listening at %s', this.server.name, this.server.url);
    });
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
}
