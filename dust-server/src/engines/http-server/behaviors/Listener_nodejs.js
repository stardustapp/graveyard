const http = require('http');
const url = require('url');
const querystring = require('querystring');
const pkgMeta = require('../../../../nodejs/package.json');

GraphEngine.attachBehavior('http-server/v1-beta1', 'Listener', {
  // constructor: nodeType, data

  async start() {
    this.connNodes = new LoaderCache(async conn => {
      const localEndpoint = conn.address();
      const connNode = await this.msgEngine.buildFromStore({
        WireProtocol: 'HTTP/1',
        SocketFamily: localEndpoint.family,
        Server: {
          Address: localEndpoint.address,
          Port: localEndpoint.port,
        },
        Peer: {
          Address: conn.remoteAddress,
          Port: conn.remotePort,
        },
      }, this.msgStore);
      return connNode.getGraphCtx().getNodeById(connNode.nodeId);
    });

    this.msgEngine = await GraphEngine.load('http-messages/v1-beta1');
    this.msgStore = new RawVolatileStore({
      engineKey: 'http-messages/v1-beta1',
    });
    //this.graphWorld = await msgEngine.buildFromStore({}, msgStore);
    //msgStore.engine.buildUsingVolatile({argv});

    this.nodeServer = http.createServer(this.routeRequest.bind(this));
    await new Promise((resolve, reject) => {
      this.nodeServer.on('error', (err) => {
        if (err.syscall === 'listen')
          return reject(err);
        console.error('http-server/Listener encountered network error', JSON.stringify(err));
        throw err;
      });

      const {Tcp, Unix} = this.Interface;
      if (Tcp) {
        this.nodeServer.listen(Tcp.Port, Tcp.Host, resolve);
      } else throw new Error(
        `TODO: support for that Listener interface!`);
    });

    const {address, port} = this.nodeServer.address();
    console.debug('http-server listening on http://%s:%s', address, port);

    // store a heartbeat blob on the
    this.Status = {
      State: 'Ready',
      Message: `Listening on http://${address}:${port}`,
      Host: 'nodejs',
      LastChange: new Date,
      Heartbeat: new Date,
    };
    // TODO: clearing, standardization
    this.heartbeatInterval = setInterval(() => {
      this.Status.Heartbeat = new Date;
    }, 20 * 1000);

    return {address, port};
  },

  unref() {
    this.nodeServer.unref();
    this.heartbeatInterval.unref();
  },

  async routeRequest(req, res) {
    try {
      console.log(req.method, req.url);
      const {pathname, query} = url.parse(req.url, true);

      const connMsg = await this.connNodes.get(req.connection);

      if (!req.headers.host) {
        console.log(`${req.method} //${req.headers.host}${req.url}`, 400);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(`The "Host" HTTP header is required.`, 'utf-8');
        return;
      }

      const hostMatch = req.headers.host.match(
    /^(?:([0-9]{1,3}(?:\.[0-9]{1,3}){3})|\[([0-9a-f:]+(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3})?)\]|((?:[a-z0-9_.-]+\.)?[a-z][a-z0-9]+))(?::(\d+))?$/i);
      if (!hostMatch) {
        console.log(`${req.method} //${req.headers.host}${req.url}`, 400);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end(`
          The "Host" HTTP header could not be parsed.
          If your request is reasonable, please file a bug.
        `, 'utf-8');
        return;
      }
      const [_, ipv4, ipv6, hostname, altPort] = hostMatch;

      // reconstruct duplicated queries as
      const queryList = new Array;
      for (var param in query) {
        if (query[param].constructor === Array)
          for (const subVal of query[param])
            queryList.push({Key: param, Value: subVal});
        else
          queryList.push({Key: param, Value: query[param]});
      }

      if (!req.url.startsWith('/')) {
        console.log(remoteAddress, 'send bad url', req.url, 'with method', method);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        return res.end(`Your request URI doesn't smell right.`, 'utf-8');
      }

      const reqMsg = await connMsg.ISSUED.newRequest({
        Timestamp: new Date,
        Method: req.method,
        Url: req.url,
        HttpVersion: req.httpVersion,
        Headers: Object.keys(req.headers).map(x => ({
          Key: x, Value: req.headers[x],
        })),

        RemoteAddress: req.connection.remoteAddress, // TODO: X-Forwarded-For
        HostName: hostname || ipv4 || ipv6,
        AltPort: altPort.length ? parseInt(altPort) : null,
        Origin: `http://${hostname || ipv4 || ipv6}${altPort.length ? ':' : ''}${altPort}`,
        Path: pathname,
        Query: queryList,
        Body: { Base64: '' }, // TODO
      });
      //console.log('built http request message', reqMsg);

      // Process into a response
      const response = await (await this.Handler).handle(reqMsg);
      if (!response) throw new Error(
        `http-server/Handler didn't return a response`);

      // write HTTP head
      for (const {Key, Value} of response.Headers)
        res.setHeader(Key, Value);
      res.writeHead(response.Status.Code, response.Status.Message);

      // write body
      switch (response.Body.currentKey) {
        case 'StringData':
          res.end(response.Body.StringData, 'utf-8');
          break;
        case 'Base64':
          res.end(response.Body.StringData, 'utf-8');
          break;
        default:
          throw new Error(`unhandled Body key ${response.Body.currentKey}`)
      }

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Dust Server encountered an internal error.\n\n`+err.stack, 'utf-8');
    }
  },

});

/*

HttpServer = class HttpServer {
  constructor(domainManager, hostLoader) {
    this.domainManager = domainManager;


    this.handlers = [];
    this.defaultHandler = HttpWildcardHandler.bind(null, this);

    this.hostLoaders = new Map;
    this.hostLoaderFactory = hostLoader;
  }

  addRoute(regex, handler) {
    this.handlers.push([regex, new RegExp(regex), handler]);
  }

  getVHost(hostname) {
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

      const html = commonTags.safeHtml`<!doctype html>
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
`+`\n  `+target.Children.map(c => {
  const dirChar = c.Type === 'Folder' ? '/' : '';
  return commonTags.safeHtml`
  <li><a href="${c.Name}${dirChar}">${c.Name}</a>${dirChar}</li>
`}).join('\n  ')+`\n`+commonTags.safeHtml`</ul>
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

  }
}



    const mainVHost = {
      handleGET: async (meta, responder) => {
        const {method, uri, headers, queryParams, ip} = meta;
        const parts = uri.slice(1).split('/');
        if (parts[0] === 'dust-app' && parts[1]) {
          return responder.sendJson({hello: 'world'});
        }
        if (parts[0] === 'raw-dust-app' && parts[1]) {
          if (parts[2] === '~~ddp') {
            return responder.sendJson({todo: true});
          }
          return await this.dustManager.serveAppPage(this.graphWorld, parts[1], meta, responder);
        }

        // TODO: proper filesystem serving support
        if (parts[0] === '~~src' && parts.slice(-1)[0].endsWith('.js')) {
          const filePath = ['src', ...parts.slice(1)].join('/');
          console.log('streaming JS source file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'application/javascript');
        }
        if (parts[0] === '~~vendor' && parts.slice(-1)[0].endsWith('.js')) {
          const filePath = ['vendor', ...parts.slice(1)].join('/');
          console.log('streaming JS source file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'application/javascript');
        }
        if (parts[0] === '~~vendor' && parts.slice(-1)[0].endsWith('.css')) {
          const filePath = ['vendor', ...parts.slice(1)].join('/');
          console.log('streaming CSS file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'text/css');
        }
        if (parts[0] === '~~vendor' && parts.slice(-1)[0].endsWith('.woff2')) {
          const filePath = ['vendor', ...parts.slice(1)].join('/');
          console.log('streaming font file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'application/font-woff2');
        }

        return responder.sendJson({error: 'not-found'}, 404);
      },
    };

*/
