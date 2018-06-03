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
    return this.hostLoaders.get(null);
  }

  /*async*/ getDefaultHost() {
    return this.hostLoaders.get(null);
  }
}

class VirtualHost {
  constructor(hostname, webEnv) {
    this.hostname = hostname;
    this.webEnv = webEnv;
  }

  static /*async*/ fromManifest() {
    return new Promise(r => 
      chrome.runtime.getPackageDirectoryEntry(r))
      .then(pkgRoot => {
        const webEnv = new Environment('http://localhost');
        webEnv.bind('', new DefaultSite('localhost'));
        webEnv.bind('/~dan/editor', new WebFilesystemMount({
          entry: pkgRoot,
          prefix: 'platform/apps/editor/',
        }));
        webEnv.bind('/~dan/panel', new WebFilesystemMount({
          entry: pkgRoot,
          prefix: 'platform/apps/panel/',
        }));
        webEnv.bind('/~~libs', new WebFilesystemMount({
          entry: pkgRoot,
          prefix: 'platform/libs/',
        }));
        return webEnv;
      })
      .then(x => new VirtualHost('localhost', x));
  }

  async handleGET(req, responder) {
    const [reqPath, queryStr] = (req.uri || '/').split('?');

    let target;

    // If it's a directory, try filling entry with index.html
    if (reqPath.endsWith('/')) {
      const indexEntry = await this.webEnv.getEntry(reqPath+'index.html');
      if (indexEntry && indexEntry.get) {
        target = await indexEntry.get();
      }
    }

    // If we don't have a target yet just get it directly
    if (!target) {
      const entry = await this.webEnv.getEntry(reqPath);
      if (!entry || !entry.get) {

        // Maybe it's a directory instead of a file?
        if (!reqPath.endsWith('/')) {
          const dEntry = await this.webEnv.getEntry(reqPath + '/');
          if (dEntry && dEntry.get) {
            let newUrl = reqPath + '/';
            if (req.uri.includes('?'))
              newUrl += '?' + queryStr;
            return responder.redirectTo(newUrl);
          }
        }

        return responder.sendJson({error: 'not-found'}, 404);
      }
      target = await entry.get();
    }

    if (!target) {
      return responder.sendJson({error: 'null-target'}, 500);

    } else if (target.Type === 'Blob') {
      const decoded = atob(target.Data);

      // write the bytes of the string to an ArrayBuffer
      var ab = new ArrayBuffer(decoded.length);
      var ia = new Uint8Array(ab);
      for (var i = 0; i < decoded.length; i++) {
          ia[i] = decoded.charCodeAt(i);
      }

      // For text files, assume UTF-8
      let type = target.Mime || 'application/octet-stream';
      if (type.startsWith('text/') && !type.includes('charset=')) {
        type += '; charset=utf-8';
      }
      responder.addHeader('Content-Type', type);
      responder.emitResponse(200, ab);

    } else if (target.Type === 'Folder') {

      const html = `<!doctype html>
<title>${target.Name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style type="text/css">
  body { background-color: #ddd; }
  footer { color: #333; }
  footer p { margin: 0; }
</style>
<h1>${target.Name}/</h1>
<p><a href="..">Navigate up</a></p>
<hr>
<ul>
`+target.Children.map(c => {
  const dirChar = c.Type === 'Folder' ? '/' : '';
  return `  <li><a href="${encodeURIComponent(c.Name)}${dirChar}">${c.Name}</a>${dirChar}</li>
`}).join('')+`</ul>
<hr>
<footer>
  <p>Generated by <a href="https://github.com/stardustapp/chrome-profile-server">${HttpServer.SERVER_HEADER}</a></p>
  <p>Served as ${this.webEnv.baseUri}</p>
  <p>Powered by the Stardust platform</p>
</footer>`;
      responder.sendHtml(html);

    } else {
      responder.sendJson(target);
    }
  }
}

HttpServer.SERVER_HEADER = 'Chrome-'
  +chrome.runtime.getManifest().short_name+'/'
  +chrome.runtime.getManifest().version;


class Responder {
  constructor(handler) {
    this.handler = handler;
    this.statusCode = null;
  }

  addHeader(key, val) {
    this.handler.setHeader(key, val);
  }

  emitResponse(statusCode, payload) {
    if (this.statusCode != null) {
      throw new Error(`App tried to send additional HTTP responses`);
    }
    const {handler} = this;
    handler.statusCode = statusCode;

    handler.responseLength = payload.length || payload.byteLength;
    handler.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    handler.setHeader('Server', HttpServer.SERVER_HEADER);
    handler.writeHeaders(statusCode);
    handler.write(payload);
    handler.finish();
  }

   // Helpers

  sendJson(data, status=200) {
    this.addHeader('Content-Type', 'application/json');
    this.emitResponse(status, JSON.stringify(data, null, 2));
  }

  sendHtml(data, status=200) {
    this.addHeader('Content-Type', 'text/html');
    this.emitResponse(status, data);
  }

  redirectTo(target, status=303) {
    this.addHeader('Location', target);
    this.emitResponse(status, `<!doctype html>
<title>Redirecting...</title>
<p>You are being redirected to <a href="${target}">${target}</a>.</p>`);
  }
}

class HttpWildcardHandler extends WSC.BaseHandler {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
  }

  async get() {
    const {headers, uri, method} = this.request;
    const {localAddress, localPort, peerAddress, peerPort} =
        await new Promise(r => chrome.sockets.tcp.getInfo(
            this.request.connection.stream.sockId, r));

    const meta = {method, uri, headers,
      ip: {localAddress, localPort, peerAddress, peerPort}};
    const responder = new Responder(this);

    try {
      if (!headers.host) {
        console.log(`GET //${headers.host}${uri}`, 400);
        return responder.sendJson({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header is required.',
        }, 400);
      }

      const hostMatch = headers.host.match(
  /^(?:([0-9]{1,3}(?:\.[0-9]{1,3}){3})|\[([0-9a-f:]+(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3})?)\]|((?:[a-z0-9_.-]+\.)?[a-z]+))(?::(\d+))?$/i);
      if (!hostMatch) {
        console.log(`GET //${headers.host}${uri}`, 400);
        return responder.sendJson({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header could not be parsed. If your request is reasonable, please file a bug.',
        }, 400);
      }
      const [_, ipv4, ipv6, hostname, port] = hostMatch;

      if (ipv4 || ipv6 || hostname == 'localhost') {
        const vhost = await this.httpServer.getDefaultHost();
        return await vhost.handleGET(meta, responder);
      }

      if (hostname) {
        const vhost = await this.httpServer.getVHost(hostname);
        if (vhost) {
          return await vhost.handleGET(meta, responder);
        } else {
          console.log(`GET //${headers.host}${uri}`, 506);
          return responder.sendJson({
            success: false,
            error: 'domain-not-found',
            message: `Misdirected Request: The website you tried to access doesn't exist here`,
            cause: `This server doesn't have a domain configured with a website for the hostname ${hostname}. If this is your domain, go ahead and claim it from within your personal dashboard.`,
          }, 421);
        }
      }
    } catch (err) {
      console.log(`GET //${headers.host}${uri}`, 500, err);
      return responder.sendJson({
        success: false,
        error: 'internal-error',
        message: `The server failed to respond`,
        cause: `${err.name}: ${err.message}`,
      }, 500);
      throw err;
    }
  }
}
