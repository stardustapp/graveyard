const Koa = require('koa');
const route = require('koa-route');
const commonTags = require('common-tags');
const websockify = require('koa-websocket');
const bodyParser = require('koa-bodyparser');

const {
  FolderLiteral, StringLiteral, BlobLiteral, InflateSkylinkLiteral,
  TempDevice, AsyncCache,
  SKYLINK_CORE_OPS, ChannelExtension, SkylinkServer, InlineChannelCarrier,
} = require('@dustjs/standard-machine-rt');

const {CreateMapCache, FirestoreMap} = require('./firestore-map.js');

class SessionsEnv {
  constructor(domain) {
    this.domain = domain;
  }

  async getEntry(path) {
    if (path.length < 2) return null;
    const secondSlash = path.indexOf('/', 1);
    if (secondSlash < 2) return null;
    const sessionId = path.slice(1, secondSlash);
    const subPath = path.slice(secondSlash);
    // console.log('session access:', sessionId, subPath);

    const session = await this.domain.sessionCache.get(sessionId);
    return await session.env.getEntry(subPath);
  }
}

exports.ExportSite = class ExportSite {
  constructor(context) {
    if (!context)
      throw new Error(`ExportSite requires a context`);
    this.context = context;

    this.domainEnvCache = new AsyncCache({
      loadFunc: this.createDomainEnv.bind(this),
      keyFunc: (domain) => domain.domainId,
    });

    const websockify = require('koa-websocket');
    this.koa = websockify(new Koa());

    this.koa.use(route.get('/ping', async ctx => {
      ctx.response.body = 'ok';
    }));

    this.koa.use(bodyParser({
       enableTypes: ['json']
    }));

    this.koa.use(route.post('/', async ctx => {
      // console.log('export POST:', ctx.request.body);
      const publicEnv = await this.domainEnvCache.get(ctx.state.domain);
      const skylinkServer = new SkylinkServer(publicEnv);

      const {body} = ctx.request;
      ctx.response.body = await skylinkServer.processFrame(body);
    }));

    this.koa.ws.use(route.all('/ws', async (ctx) => {
      try {
        const publicEnv = await this.domainEnvCache.get(ctx.state.domain);
        const socket = new SkylinkWebsocket(ctx.websocket, publicEnv);
      } catch (err) {
        console.log('ws accept error:', err);
      }
    }));
  }

  async createDomainEnv(domain) {
    const sessionEnv = new SessionsEnv(domain);

    const publicEnv = new Environment;
    publicEnv.bind('/sessions', sessionEnv);

    // legacy 'skychart' api
    publicEnv.mount('/open', 'function', {async invoke(username) {
      const chart = new Environment;
      const handle = await domain.fetchHandleSnap(username.StringValue);

      if (!handle.uid) throw new Error(
        `Handle is not available for authentication!`);

      chart.mount('/owner-name', 'literal', {string: handle.metadata.displayName}); // also createdAt
      chart.mount('/owner-email', 'literal', {string: 'todo (private?)'});
      chart.mount('/home-domain', 'literal', {string: domain.fqdn});
      chart.mount('/launch', 'function', {async invoke(secret) {
        // console.log({secret});
        const profile = await domain.context.getUserProfile(handle.uid);
        const {email, disabled} = profile;
        // console.log({email, secret})
        if (!email || disabled) throw new Error(
          `Handle is not available for authentication!!`);

        const newUid = await domain.context.resolveUserFromEmailPassword(email, secret.StringValue);
        if (newUid !== handle.uid) throw new Error(
          `BUG: UIDs got mismatched, refusing to sign in. ${newUid} != ${handle.uid}`);

        const session = await domain.createHandleSession(handle.handle.toLowerCase(), {
          lifetime: 'short',
          client: 'export-site chart launch of ~'+username.StringValue,
        });
        return {Type: 'String', Name: 'session-id', StringValue: session.sessionId};
      }});
      return chart;
    }});

    return publicEnv;
  }
}

class SkylinkWebsocket {
  constructor(webSocket, publicEnv) {
    this.webSocket = webSocket;

    // create a new environment just for this connection
    this.env = new Environment();
    this.env.bind('/tmp', new TempDevice);
    this.env.bind('/pub', publicEnv);

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
    } catch (err) {
      console.error('WS ERR:', err);
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
