class SkylinkPostHandler extends WSC.BaseHandler {
  constructor(nsExport) {
    super();
    this.nsExport = nsExport;
  }

  sendResponse(data) {
    const payload = JSON.stringify(data);

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
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

let openChannels = 0;
setInterval(() => {
  Datadog.Instance.gauge('skylink.channel.open_count', openChannels);
})

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
    if (this.ws_connection) {
      this.write_message(JSON.stringify(body));
    } else {
      console.warn(`TODO: channel's downstream websocket isnt connected anymore`)
    }
  }

  // Given a function that gets passed a newly-allocated channel
  async newChannelFunc(input) {
    Datadog.Instance.count('skylink.channel.opens', 1);
    openChannels++;

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
        Datadog.Instance.count('skylink.channel.packets', 1, {status: 'next'});
      },
      stop(message) {
        this.sendJson({
          Status: 'Stop',
          Chan: chanId,
          Output: message,
        });
        Datadog.Instance.count('skylink.channel.packets', 1, {status: 'stop'});
        openChannels--;
      },
    }
    this.channels.set(chanId, channel);
    return channel;
  }

  sendOutput(ok, output) {
    console.debug('<-- op was', ok ? 'okay' : 'not ok');
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
    //console.debug('got ws message', request);
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
      const stackSnip = (err.stack || new String(err)).split('\n').slice(0,4).join('\n');
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

  head(path) {
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
    this.writeHeaders(200);
    this.finish();
  }

  get(path) {
    const payload = JSON.stringify({Ok: true});

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(200);
    this.write(payload);
    this.finish();
  }
}
