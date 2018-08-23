function ExposeSkylinkOverHttp(env, httpd) {
  // all POSTs run against the same skylink server
  const stateless = new SkylinkServer(env);
  httpd.addRoute('^/~~export$', SkylinkPostHandler.bind(null, stateless));

  // websockets make their own skylink server for state
  httpd.addRoute('^/~~export/ws$', SkylinkWebsocketHandler.bind(null, env));

  // pings are dumb lol
  httpd.addRoute('^/~~export/ping$', SkylinkPingHandler);
}

// Uses the given SkylinkServer instance for every request
class SkylinkPostHandler extends WSC.BaseHandler {
  constructor(skylink) {
    super();
    this.skylink = skylink;
  }

  sendResponse(data, status=200) {
    const payload = JSON.stringify(data);

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(status);
    this.write(payload);
    this.finish();
  }

  async post(path) {
    try {
      // Parse up the submitted JSON
      var request = JSON.parse(
        String.fromCharCode.apply(null,
          new Uint8Array(this.request.body)));
    } catch (err) {
      this.sendResponse({
        error: true,
        message: `Couldn't parse JSON from your POST body`,
        detail: err.message,
      }, 400);
      throw err;
    }

    const response = await this.skylink.processFrame(request);
    this.sendResponse(response);
  }
}

class SkylinkWebsocketHandler extends WSC.WebSocketHandler {
  constructor(pubEnv) {
    super();

    // create a new environment just for this connection
    this.env = new Environment();
    this.env.bind('/tmp', new TemporaryMount);
    this.env.bind('/pub', pubEnv);

    this.skylink = new SkylinkServer(this.env);
    this.skylink.attach(new ChannelExtension());
    this.skylink.attach(new InlineChannelCarrier(this.sendJson.bind(this)));

    this.isActive = false;
    this.reqQueue = new Array;
  }

  sendJson(body) {
    if (this.ws_connection) {
      this.write_message(JSON.stringify(body));
      if (body._after) body._after();
    } else {
      console.warn(`TODO: channel's downstream websocket isnt connected anymore`)
    }
  }

  // These functions are invoked by the websocket processor
  open() {}
  on_message(msg) {
    var request = JSON.parse(msg);
    if (this.isActive) {
      this.reqQueue.push(request);
    } else {
      this.isActive = true;
      this.processRequest(request);
    }
  }
  on_close() {
    this.skylink.handleShutdown(new StringLiteral('reason', 'WebSocket was closed'));
    // TODO: shut down session
  }

  async processRequest(request) {
    try {
      const response = await this.skylink.processFrame(request);
      this.sendJson(response);

    //const stackSnip = (err.stack || new String(err)).split('\n').slice(0,4).join('\n');
    } finally {
      // we're done with the req, move on
      if (this.reqQueue.length) {
        this.processRequest(this.reqQueue.shift());
      } else {
        this.isActive = false;
      }
    }
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
