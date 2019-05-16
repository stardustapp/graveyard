const http = require('http');
const url = require('url');
const querystring = require('querystring');
const pkgMeta = require('../../../../nodejs/package.json');
global.HTTP_SERVER_HEADER = `${pkgMeta.name}/${pkgMeta.version}`;

GraphEngine.attachBehavior('http-server/v1-beta1', 'Listener', {
  // constructor: nodeType, data

  async activate(graphWorld) {
    this.graphWorld = graphWorld;

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

    this.nodeServer = http.createServer(this.handleRequest.bind(this));
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

  async handleRequest(req, res) {
    const startDate = new Date;
    const tags = {
      listener_id: this.nodeId,
      host_header: req.headers.host,
      method: req.method,
      http_version: req.httpVersion,
    };

    try {
      await this.routeRequest(req, res, tags);
      tags.ok = true;
    } catch (err) {
      if (res.headersSent) throw err;
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (err instanceof HttpBodyThrowable) {
        tags.ok = true;
        tags.statuscode = err.statusCode;
        for (key in err.headers)
          res.setHeader(key, err.headers[key]);
        if (!('Content-Type' in err.headers))
          res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.writeHead(err.statusCode);
        res.end(err.message, 'utf-8');
      } else {
        tags.ok = false;
        tags.statuscode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
        res.writeHead(500);
        res.end(`Dust Server encountered an internal error.\n\n`+err.stack, 'utf-8');
      }
    } finally {
      const endDate = new Date;
      Datadog.Instance.gauge('dust.http-server.elapsed_ms', endDate-startDate, tags);
      Datadog.Instance.count('dust.http-server.web_request', 1, tags);
    }
  },

  async routeRequest(req, res, tags) {
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

    // reconstruct repeated query keys as a pair list
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
    const response = await (await this.Handler).handle(reqMsg, this.graphWorld, tags);
    if (!response) throw new Error(
      `http-server/Handler didn't return a response`);

    // write HTTP head
    res.setHeader('Date', moment.utc(response.Timestamp).format('ddd, DD MMM YYYY HH:mm:ss [GMT]'));
    res.setHeader('Server', HTTP_SERVER_HEADER);
    for (const {Key, Value} of response.Headers)
      res.setHeader(Key, Value);
    res.writeHead(response.Status.Code, response.Status.Message);

    // write body
    switch (response.Body.currentKey) {
      case 'StringData':
        res.end(response.Body.StringData, 'utf-8');
        break;
      case 'Base64':
        res.end(new Buffer(response.Body.Base64, 'base64'));
        break;
      case 'NativeStream':
        response.nodeJsStream.pipe(res);
        break;
      default:
        throw new Error(`unhandled Body key ${response.Body.currentKey}`)
    }
  },

});

/*
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
        // serve static files
        return responder.sendJson({error: 'not-found'}, 404);
      },
    };

*/
