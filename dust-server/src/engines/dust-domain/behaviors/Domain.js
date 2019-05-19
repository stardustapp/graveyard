GraphEngine.attachBehavior('dust-domain/v1-beta1', 'Domain', {

  async activate() {
    this.systemEnv = new Environment();
    await this.systemEnv.bind('/data/graph%20world', this.graphDaemon.graphWorld);
    this.skylinkServer = new SkylinkServer(this.systemEnv);
  },

  async serveHttpRequest(graphWorld, request) {
    if (request.Body.currentKey === 'HttpUpgrade') {
      if (request.Path !== '/~~export/ws') throw new Error(`bad ws path ${request.Path}`);
      return await request.makeWebSocketResponse(webSocket => {
        console.log('upgraded websocket for', request.Path);
        new SkylinkWebsocket(webSocket, this.systemEnv);
      });
    }

    if (request.Path === '/~~export') {
      if (request.Method !== 'POST') throw new HttpBodyThrowable(405, 'POST-only endpoint');

      let body = null;
      try {
        // Parse up the submitted JSON
        console.log(request);
        body = JSON.parse(request.Body.String);
      } catch (err) {
        throw new HttpBodyThrowable(400, `Couldn't parse JSON from your POST body`);
      }

      const response = await this.skylinkServer.processFrame(body);
      return request.makeJsonResponse(response);
    }

    if (request.Path === '/~/app-session') {
      if (request.Method !== 'POST') throw new HttpBodyThrowable(405, 'POST-only endpoint');
      return request.makeJsonResponse({
        metadata: {
          chartName: 'dust',
          homeDomain: this.DomainName,
          ownerName: 'dust demo',
          ownerEmail: 'dust@example.com',
        },
        //sessionPath: '/pub/sessions/' + randomString() + '/mnt',
        sessionPath: '/pub',
      });
    }

    return request.makePlaintextResponse("not found", 404)
  },

});


class SkylinkWebsocket {
  constructor(webSocket, pubEnv) {
    this.webSocket = webSocket;

    // create a new environment just for this connection
    this.env = new Environment();
    this.env.bind('/tmp', new TemporaryMount);
    this.env.bind('/pub', pubEnv);

    this.skylink = new SkylinkServer(this.env);
    this.skylink.attach(new ChannelExtension());
    this.skylink.attach(new InlineChannelCarrier(this.sendJson.bind(this)));

    this.isActive = false;
    this.reqQueue = new Array;

    webSocket.on('message', this.on_message.bind(this));
    webSocket.on('close', this.on_close.bind(this));
  }

  sendJson(body) {
    if (this.webSocket) {
      this.webSocket.send(JSON.stringify(body));
      if (body._after) body._after();
    } else {
      console.warn(`TODO: channel's downstream websocket isnt connected anymore`)
    }
  }

  // These functions are invoked by the websocket processor
  on_message(msg) {
    let request;
    try {
      request = JSON.parse(msg);
    } catch (err) {
      throw new HttpBodyThrowable(400, `Couldn't parse JSON from your websocket frame`);
    }
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
