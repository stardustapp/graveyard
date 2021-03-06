const http = require('http');
const url = require('url');
const querystring = require('querystring');
const pkgMeta = require('../../../../nodejs/package.json');
global.HTTP_SERVER_HEADER = `${pkgMeta.name}/${pkgMeta.version}`;

GraphEngine.attachBehavior('http-server/v1-beta1', 'Listener', {
  // constructor: nodeType, data

  async deleteConnection(rawConn) {
    const connNode = this.connNodes.peek(rawConn);
    if (!connNode) throw new Error(
      `Tried freeing HTTP connectiont that wasn't registered`);
    this.connNodes.delete(rawConn);
    connNode.getGraphCtx().freeBackingStore();
  },

  async activate(graphWorld) {
    this.graphWorld = graphWorld;

    this.connNodes = new LoaderCache(async conn => {
      const localStore = new RawVolatileStore({
        engineKey: 'http-messages/v1-beta1',
      });

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
      }, localStore);
      conn.on('close', hadError => {
        // TODO: store ClosedAt and allow more automatic GC
        this.deleteConnection(conn);
      });
      return connNode.getGraphCtx().getNodeById(connNode.nodeId);
    });

    this.msgEngine = await GraphEngine.load('http-messages/v1-beta1');
    // this.msgStore = new RawVolatileStore({
    //   engineKey: 'http-messages/v1-beta1',
    // });
    //this.graphWorld = await msgEngine.buildFromStore({}, msgStore);
    //msgStore.engine.buildUsingVolatile({argv});

    this.nodeServer = http.createServer(this.handleNormalRequest.bind(this));
    this.nodeServer.on('upgrade', this.handleUpgradeRequest.bind(this));

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

  describeInterface() {
    if (this.Interface.Unix)
      return `unix-${this.Interface.Unix.Path}`;
    if (this.Interface.Tcp) {
      const {Interface, Host, Port} = this.Interface.Tcp;
      return [`tcp`, Interface, Host, Port].filter(x=>x).join('-');
    }
    throw new Error(`Cannot describe unknown Listener.Interface`);
  },

  async handleNormalRequest(req, res) {
    const startDate = new Date;
    const tags = {
      listener: this.describeInterface(),
      host_header: req.headers.host,
      method: req.method,
      http_version: req.httpVersion,
    };
    res.on('finish', () => {
      const finishDate = new Date;
      Datadog.Instance.gauge('dust.http-server.finished_ms', finishDate-startDate, tags);
    });

    try {
      const response = await this.routeNormalRequest(req, res, tags);
      tags.statuscode = response.Status.Code;
    } catch (err) {
      tags.errortype = err.constructor.name;
      tags.statuscode = this.writeThrowable(res, err);
    } finally {
      tags.statusclass = (tags.statuscode || 0).toString()[0]; // if 0, then bug

      const endDate = new Date;
      Datadog.Instance.gauge('dust.http-server.elapsed_ms', endDate-startDate, tags);
      Datadog.Instance.count('dust.http-server.web_request', 1, tags);
    }
  },
  async routeNormalRequest(req, res, tags) {
    const reqMsg = await this.ingestRequest(req);

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
    console.log('Sent HTTP', response.Status.Code, 'in response to', req.method, req.url)

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
    return response;
  },

  async handleUpgradeRequest(request, socket, head) {
    const startDate = new Date;
    const tags = {
      listener: this.describeInterface(),
      host_header: request.headers.host,
      upgrade_header: request.headers.upgrade,
      method: request.method,
      http_version: request.httpVersion,
    };

    try {
      tags.ok = await this.routeUpgradeRequest(request, socket, head, tags);
    } catch (err) {
      console.log('WARN: http-server upgrade crash:', err.stack);
      tags.ok = false;
      socket.destroy();
    } finally {
      Datadog.Instance.count('dust.http-server.upgrade_request', 1, tags);
    }
  },
  async routeUpgradeRequest(request, socket, head, tags) {
    if (!this.wsServer) {
      const ws = require('ws');
      this.wsServer = new ws.Server({noServer: true});
      this.wsServer.on('error', err => this.onWsServerError(err));
    }

    const reqMsg = await this.ingestRequest(request);
    reqMsg.Body = { HttpUpgrade: true };

    // Process into a fake response
    const response = await (await this.Handler).handle(reqMsg, this.graphWorld, tags);
    if (!response) throw new Error(
      `http-server/Handler didn't return a response`);

    if (response.Status.Code === 101 && response.Body.currentKey === 'WebSocket') {
      const {WebSocket} = response.Body;
      this.wsServer.handleUpgrade(request, socket, head, WebSocket.connCallback);
      return true;
    } else {
      // TODO: fatal?
      console.error('WARN: Upgrade got bad response status', response.Status.Code, response.Body.currentKey);
      socket.destroy();
      return false;
    }
  },

  writeThrowable(res, err) {
    if (res.headersSent) throw err;
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (err instanceof HttpBodyThrowable) {
      const statusCode = err.statusCode || 500;
      for (key in err.headers)
        res.setHeader(key, err.headers[key]);
      if (!err.headers || !('Content-Type' in err.headers))
        res.setHeader('Content-Type', 'text/plain; charset=UTF-8');

      res.writeHead(statusCode);
      res.end(err.message, 'utf-8');
      return statusCode;
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
      res.writeHead(500);
      res.end(`Dust Server encountered an internal error.\n\n`+err.stack, 'utf-8');
      return 500;
    }
  },

  async ingestRequest(req) {
    console.log(req.method, req.url);
    const {pathname, query} = url.parse(req.url, true);

    const connMsg = await this.connNodes.get(req.connection);

    if (!req.headers.host) {
      console.log(`${req.method} //${req.headers.host}${req.url}`, 400);
      throw new HttpBodyThrowable(400, `The "Host" HTTP header is required.`);
    }

    const hostMatch = req.headers.host.match(
  /^(?:([0-9]{1,3}(?:\.[0-9]{1,3}){3})|\[([0-9a-f:]+(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3})?)\]|((?:[a-z0-9_.-]+\.)?[a-z][a-z0-9]+))(?::(\d+))?$/i);
    if (!hostMatch) {
      console.log(`${req.method} //${req.headers.host}${req.url}`, 400);
      throw new HttpBodyThrowable(400, `
        The "Host" HTTP header could not be parsed.
        If your request is reasonable, please file a bug.
      `);
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
      throw new HttpBodyThrowable(400, `Your request URI doesn't smell right.`);
    }

    return await connMsg.ISSUED.newRequest({
      Timestamp: new Date,
      Method: req.method,
      Url: req.url,
      HttpVersion: req.httpVersion,
      Headers: Object.keys(req.headers).map(x => ({
        Key: x, Value: req.headers[x],
      })),

      RemoteAddress: req.connection.remoteAddress, // TODO: X-Forwarded-For
      HostName: hostname || ipv4 || ipv6,
      AltPort: altPort ? parseInt(altPort) : null,
      Origin: `http://${hostname || ipv4 || ipv6}${altPort ? ':' : ''}${altPort}`,
      Path: pathname,
      Query: queryList,
      Body: { Base64: '' }, // TODO
    });
    //console.log('built http request message', reqMsg);
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
    }
*/
