class HttpServer {
  constructor(domainManager) {
    this.domainManager = domainManager;
    this.wsc = new WSC.WebApplication({
      host: '0.0.0.0',
      handlers: [
        [/^.+$/, HttpWildcardHandler.bind(null, this)],
      ],
    });
  }

  addRoute(regex, handler) {
    this.wsc.handlers.splice(-1, 0, [regex, handler]);
    this.wsc.handlersMatch.splice(-1, 0, [new RegExp(regex), handler]);
  }

  startServer(port=9237) {
    this.wsc.port = port;
    this.wsc.start();
    console.log('listening on %s', this.wsc.port);
  }
}

HttpServer.SERVER_HEADER = 'Chrome-'
  +chrome.runtime.getManifest().short_name+'/'
  +chrome.runtime.getManifest().version;


class HttpWildcardHandler extends WSC.BaseHandler {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
  }

  sendResponse(data) {
    const payload = JSON.stringify(data, null, 2);

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(200);
    this.write(payload);
    this.finish();
  }

  async get() {
    const {headers, path, method} = this.request;
    const {localAddress, localPort, peerAddress, peerPort} =
        await new Promise(r => chrome.sockets.tcp.getInfo(
            this.request.connection.stream.sockId, r));

    //const domain = httpServer.getDomain();

    this.sendResponse({method, path, headers, ip: {localAddress, localPort, peerAddress, peerPort}});
  }
}
