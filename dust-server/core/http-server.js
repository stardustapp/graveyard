class HttpServer {
  constructor(domainManager) {
    this.domainManager = domainManager;
    this.wsc = new WSC.WebApplication({
      host: '0.0.0.0',
      handlers: [
        [/^.+$/, HttpWildcardHandler.bind(null, this)],
      ],
    });

    this.hostLoaders = new Map;
    this.hostLoaders.set(null, VirtualHost.fromManifest());
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

  /*async*/ getVHost(hostname) {
    if (this.hostLoaders.has(hostname)) {
      return this.hostLoaders.set(hostname);
    }
  }

  /*async*/ getDefaultHost() {
    return this.hostLoaders.get(null);
  }
}

class VirtualHost {
  constructor(hostname, folderDevice) {
    this.hostname = hostname;
    this.folderDevice = folderDevice;
  }

  static /*async*/ fromManifest() {
    return new Promise(r => 
      chrome.runtime.getPackageDirectoryEntry(r))
      .then(x => new WebFilesystemMount({root: x}))
      .then(x => new VirtualHost('localhost', x));
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

  sendResponse(data, status=200) {
    const payload = JSON.stringify(data, null, 2);

    this.responseLength = payload.length;
    this.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    this.setHeader('Server', HttpServer.SERVER_HEADER);
    this.setHeader('Content-Type', 'application/json');
    this.writeHeaders(status);
    this.write(payload);
    this.finish();
  }

  async get() {
    try {
      const {headers, path, method} = this.request;
      const {localAddress, localPort, peerAddress, peerPort} =
          await new Promise(r => chrome.sockets.tcp.getInfo(
              this.request.connection.stream.sockId, r));

      const meta = {method, path, headers,
        ip: {localAddress, localPort, peerAddress, peerPort}};

      if (!headers.host) {
        return this.sendResponse({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header is required.',
        });
      }

      const hostMatch = headers.host.match(
  /^(?:([0-9]{1,3}(?:\.[0-9]{1,3}){3})|\[([0-9a-f:]+(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3})?)\]|((?:[a-z0-9_.-]+\.)?[a-z]+))(?::(\d+))?$/i);
      if (!hostMatch) {
        return this.sendResponse({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header could not be parsed. If your request is reasonable, please file a bug.',
        });
      }
      const [_, ipv4, ipv6, hostname, port] = hostMatch;

      if (ipv4 || ipv6 || hostname == 'localhost') {
        const vhost = await this.httpServer.getDefaultHost();
        return await vhost.handleGET(meta, this.sendResponse.bind(this));
      }

      if (hostname) {
        const vhost = await this.httpServer.getVHost(hostname);
        if (vhost) {
          return await vhost.handleGET(meta, this.sendResponse.bind(this));
        } else {
          return this.sendResponse({
            success: false,
            error: 'domain-not-found',
            message: `The website you tried to access doesn't exist here`,
            cause: `This server doesn't have a website configured for the hostname ${hostname}. If this is your domain, go ahead and claim `,
          });
        }
      }
    } catch (err) {
      return this.sendResponse({
        success: false,
        error: 'internal-error',
        message: `The server failed to response`,
        cause: `File a bug! :D ${err.name} ${err.message}`,
      }, 500);
      throw err;
    }
  }
}
