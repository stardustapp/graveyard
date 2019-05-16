const http = require('http');
const url = require('url');
const querystring = require('querystring');

const pkgMeta = require('../package.json');

HttpServer = class HttpServer {
  constructor(domainManager, hostLoader) {
    this.domainManager = domainManager;

    this.server = http.createServer(this.routeRequest.bind(this));
    this.server.on('error', (err) => {
      if (err.syscall === 'listen' && this.listenReject)
        return this.listenReject(err);
      console.error('HttpServer encountered network error', JSON.stringify(err));
      throw err;
    });

    this.handlers = [];
    this.defaultHandler = HttpWildcardHandler.bind(null, this);

    this.hostLoaders = new Map;
    this.hostLoaderFactory = hostLoader;
  }

  addRoute(regex, handler) {
    this.handlers.push([regex, new RegExp(regex), handler]);
  }

  startServer({host, port}) {
    return new Promise((resolve, reject) => {
      this.listenReject = reject;
      this.server.listen(port, host, () => {
        const {address, port} = this.server.address();
        console.debug('HttpServer listening on http://%s:%s', address, port);
        resolve(port);
        this.listenReject = null;
      });
    });
  }

  unref() {
    this.server.unref();
  }

  /*async*/ getVHost(hostname) {
    if (this.hostLoaders.has(hostname)) {
      return this.hostLoaders.get(hostname);
    }
    const loader = this.hostLoaderFactory(hostname).catch(err => {
      console.log('Failed to load vhost', hostname, err);
      this.hostLoaders.delete(hostname);
      return null;
    });
    this.hostLoaders.set(hostname, loader);
    return loader;
  }

  async routeRequest(req, res) {
    const {connection, method, httpVersion, headers, upgrade} = req;
    const {remoteAddress} = req.connection;
    console.log(remoteAddress, method, req.url);

    const handler = this.handlers.find(x => x[1].test(req.url));
    let inst = null;
    if (handler) {
      inst = new handler[2]();
    } else {
      inst = new this.defaultHandler();
    }

    if (!req.url.startsWith('/')) {
      console.log(remoteAddress, 'send bad url', req.url, 'with method', method);
      return req.end('400 sent non-path http request');
    }
    const {pathname, query} = url.parse(req.url, true);

    inst.request = {
      connection, method, headers,
      uri: pathname,
      arguments: query,
    };
    inst.response = res;

    if (method !== 'GET' && method !== 'DELETE')
      await inst.readBody(req);

    await inst[method.toLowerCase()]();
    //res.end();
  }
}

class VirtualHost {
  constructor(hostname, webEnv) {
    this.hostname = hostname;
    this.webEnv = webEnv;
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
    // TODO: redirect to add slash for Folders. this broke when trailing slash became meaningless
    if (!target) {
      const entry = await this.webEnv.getEntry(reqPath);
      if (!entry || (!entry.get && !entry.invoke)) {

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

      if (entry.get) {
        target = await entry.get();
      } else if (entry.invoke) {
        target = await entry.invoke(new StringLiteral('request', JSON.stringify(req)));
      }
    }

    if (!target) {
      return responder.sendJson({error: 'null-target'}, 500);

    } else if (target.Type === 'Blob') {
      responder.sendBlob(target);

    } else if (target.Type === 'Folder' && target.Name === 'http response') {
      // allows dynamic content to change based on the request
      responder.sendStarResponse(target);

    } else if (target.Type === 'Folder') {
      // GONE: write directory index html
      responder.sendHtml(html);

    } else {
      responder.sendJson(target);
    }

    Datadog.Instance.count('skychart.web_request', 1, {
      'home-domain': this.hostname,
      method: 'GET',
      ok: true,
    });
  }

  // Specifically for routing POST to function invocations
  // Not very forgiving, since POSTs generally come from ourself
  async handlePOST(req, responder) {
    const [reqPath, queryStr] = (req.uri || '/').split('?');

    const entry = await this.webEnv.getEntry(reqPath);
    if (!entry) {
      return responder.sendJson({error: 'not-found'}, 404);
    }
    if (!entry.invoke) {
      const allowed = [];
      if (entry.get) allowed.push('GET');
      if (entry.get) allowed.push('HEAD');
      responder.addHeader('Allow', allowed.join(', '));
      return responder.sendJson({error: 'post-not-allowed'}, 405);
    }
    const response = await entry.invoke(new StringLiteral('request', JSON.stringify(req)));

    if (!response) {
      return responder.sendJson({error: 'null-response'}, 500);
    } else if (response.Type === 'Blob') {
      responder.sendBlob(response);
    } else if (response.Type === 'Folder' && response.Name === 'http response') {
      // allows submission receivers to do things like redirect and set cookies
      responder.sendStarResponse(response);
    } else {
      responder.sendJson(response);
    }

    Datadog.Instance.count('skychart.web_request', 1, {
      'home-domain': this.hostname,
      method: 'POST',
      ok: true,
    });
  }
}

HttpServer.SERVER_HEADER = `${pkgMeta.name}/${pkgMeta.version}`;

class Responder {
  constructor(handler) {
    this.handler = handler;
    this.statusCode = null;
  }

  addHeader(key, val) {
    this.handler.setHeader(key, val);
  }

  buildResponseHeader(statusCode, responseLength) {
    if (this.statusCode != null) {
      throw new Error(`App tried to send additional HTTP responses`);
    }
    const {handler} = this;
    handler.statusCode = statusCode;

    handler.responseLength = responseLength;
    handler.setHeader('Date', moment.utc().format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    handler.setHeader('Server', HttpServer.SERVER_HEADER);
    handler.isDirectoryListing = true; // disables forced auto-MIME functionality
    return handler;
  }

  // write & finish one-shot
  emitResponse(statusCode, payload) {
    const contentLength = payload.length || payload.byteLength
    const handler = this
      .buildResponseHeader(statusCode, contentLength);

    handler.writeHeaders(statusCode);
    handler.write(payload);
    handler.finish();
  }

  // Helpers

  // NodeJS read streams
  sendStream(stream, mimeType='application/octet-stream') {
    this.addHeader('Content-Type', mimeType);
    const handler = this.buildResponseHeader(200);

    stream.once('error', err => {
      console.log('http send stream error:', err.message);
      try {
        this.sendJson({error: err.name, message: err.message}, 500);
      } catch (err) {
        console.log('http encountered new error reporting stream error', err.stack);
        handler.write(JSON.stringify({error: err.name, message: err.message}));
        handler.finish();
      }
    });
    handler.writeStream(stream);
  }

  sendJson(data, status=200) {
    this.addHeader('Content-Type', 'application/json');
    this.emitResponse(status, JSON.stringify(data, null, 2));
  }

  sendHtml(data, status=200) {
    this.addHeader('Content-Type', 'text/html');
    this.emitResponse(status, data);
  }

  sendBlob(blob, status=200) {
    // For text files, assume UTF-8
    let type = blob.Mime || 'application/octet-stream';
    if (type.startsWith('text/') && !type.includes('charset=')) {
      type += '; charset=utf-8';
    }
    this.addHeader('Content-Type', type);

    const rawBytes = base64js.toByteArray(blob.Data);
    this.emitResponse(status, rawBytes.buffer);
  }

  redirectTo(target, status=303) {
    this.addHeader('Location', target);
    this.emitResponse(status, commonTags.safeHtml`<!doctype html>
<title>Redirecting...</title>
<p>You are being redirected to <a href="${target}">${target}</a>.</p>`);
  }

  sendStarResponse(resp) {
    let statusCode = 200;
    let headers = [];
    let body = null;
    resp.Children.forEach(c => {
      switch (c.Name) {
        case 'status code':
          statusCode = parseInt(c.StringValue);
          break;
        case 'headers':
          headers = c.Children;
          break;
        case 'body':
          body = c;
          break;
      }
    });
    if (!body) {
      throw new Error(`sendStarResponse() didn't see a 'body' in the given response`);
    }

    // write it!
    for (const header of headers) {
      this.addHeader(header.Name, header.StringValue);
    }
    this.sendBlob(body, statusCode);
  }
}

class HttpWildcardHandler extends WSC.BaseHandler {
  constructor(httpServer) {
    super();
    this.httpServer = httpServer;
  }

  tcpInfo() {
    const conn = this.request.connection;
    const local = conn.address();
    return {
      family: local.family,
      localAddress: local.address,
      localPort: local.port,
      peerAddress: conn.remoteAddress,
      peerPort: conn.remotePort,
    };
  }

  async get() {
    const {headers, uri, method} = this.request;

    await this.routeRequest({
      method, uri, headers,
      queryParams: this.request.arguments || {},
      ip: this.tcpInfo(),
    });
  }

  async post() {
    const {headers, uri, method, body, bodyparams} = this.request;

    await this.routeRequest({
      method, uri, headers, body, bodyparams,
      queryParams: this.request.arguments || {},
      ip: this.tcpInfo(),
    });
  }

  async routeRequest(meta) {
    const responder = new Responder(this);
    const {headers, method, uri, ip} = meta;

    try {
      if (!headers.host) {
        console.log(`${ip.remoteAddress} ${method} //${headers.host}${uri}`, 400);
        return responder.sendJson({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header is required.',
        }, 400);
      }

      const hostMatch = headers.host.match(
  /^(?:([0-9]{1,3}(?:\.[0-9]{1,3}){3})|\[([0-9a-f:]+(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3})?)\]|((?:[a-z0-9_.-]+\.)?[a-z][a-z0-9]+))(?::(\d+))?$/i);
      if (!hostMatch) {
        console.log(`${method} //${headers.host}${uri}`, 400);
        return responder.sendJson({
          success: false,
          error: 'bad-request',
          message: 'Your browser sent a request that this server could not understand.',
          cause: 'The "Host" HTTP header could not be parsed. If your request is reasonable, please file a bug.',
        }, 400);
      }
      const [_, ipv4, ipv6, hostname, port] = hostMatch;

      let domain = hostname;
      // Treat raw IPs as localhost
      if (ipv4 || ipv6)
        domain = 'localhost';

      if (domain) {
        const vhost = await this.httpServer.getVHost(domain);
        if (vhost) {
          return await vhost[`handle${method}`](meta, responder);
        }
      }

      console.log(`${method} //${headers.host}${uri}`, 421);
      return responder.sendJson({
        success: false,
        error: 'domain-not-found',
        message: `Misdirected Request: The website you tried to access doesn't exist here`,
        cause: `This server doesn't have a domain configured with a website for the hostname ${domain}. If this is your domain, go ahead and claim it from within your personal dashboard.`,
      }, 421);

    } catch (err) {
      console.log(`${method} //${headers.host}${uri}`, 500, err);
      return responder.sendJson({
        success: false,
        error: 'internal-error',
        message: `The server failed to respond`,
        cause: err ? `${err.name}: ${err.message}` : null,
      }, 500);
      throw err;
    }
  }
}
