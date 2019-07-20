const Koa = require('koa');
const route = require('koa-route');
const commonTags = require('common-tags');
const websockify = require('koa-websocket');

const {FolderLiteral, StringLiteral, BlobLiteral, InflateSkylinkLiteral}
  = require('../../rt/nodejs/src/old/core/api-entries.js');
require('../../rt/nodejs/src/old/core/enumeration.js');
require('../../rt/nodejs/src/old/core/environment.js');
require('../../rt/nodejs/src/old/core/utils.js');

require('../../rt/nodejs/src/old/lib/path-fragment.js');

const {SKYLINK_CORE_OPS} = require('../../rt/nodejs/src/skylink/core-ops.js');
const {ChannelExtension} = require('../../rt/nodejs/src/skylink/ext-channel.js');
const {SkylinkServer} = require('../../rt/nodejs/src/skylink/server.js');
const {InlineChannelCarrier} = require('../../rt/nodejs/src/skylink/channel-server.js');

const {AsyncCache} = require('../../rt/nodejs/src/utils/async-cache.js');

class SessionsEnv {
  constructor(domain) {
    this.domain = domain;
    this.sessionCache = new AsyncCache({
      loadFunc: this.loadSession.bind(this),
    });
  }

  async loadSession(sessionId) {
    const sessionRef = this.domain.getSessionRef(sessionId+'x');
    sessionRef.onSnapshot(snapshot => {
      console.log('session next', snapshot);
    }, err => {
      console.log('session err', err);
    });
    console.log('loading session', sessionId);
  }

  async getEntry(path) {
    if (path.length < 2) return null;
    const secondSlash = path.indexOf('/', 1);
    if (secondSlash < 2) return null;
    const sessionId = path.slice(1, secondSlash);
    const subPath = path.slice(secondSlash);
    console.log('hi', sessionId, subPath);

    const session = await this.sessionCache.get(sessionId);

    return {
      get() {
        return new FolderLiteral('test', [new StringLiteral('asdf', 'yes')]);
      },
      subscribe(depth, newChan) {
        console.log({depth, newChan});
        return null;
      },
    }
  }
}

// exports.AsyncCache = class AsyncCache {
//   constructor({
//     loadFunc = false,
//     keyFunc = false,
//     cacheRejects = false,
//   }={}) {

exports.ExportSite = class ExportSite {
  constructor(domain) {
    if (!domain)
      throw new Error(`ExportSite requires a domain`);
    this.domain = domain;
    this.sessionEnv = new SessionsEnv(domain);

    this.publicEnv = new Environment;
    this.publicEnv.bind('/sessions', this.sessionEnv);
    this.skylinkServer = new SkylinkServer(this.publicEnv);

    const websockify = require('koa-websocket');
    this.koa = websockify(new Koa());

    this.koa.use(route.post('/', async ctx => {
      console.log('export POST:', ctx.request.body);

      let body = null;
      try {
        // Parse up the submitted JSON
        body = JSON.parse(ctx.request.body);
      } catch (err) {
        ctx.throw(400, `Couldn't parse JSON from your POST body`);
      }
      ctx.response.body = await this.skylinkServer.processFrame(body);
    }));

    this.koa.use(route.get('/ping', async ctx => {
      ctx.response.body = 'ok';
    }));

    this.koa.ws.use(route.all('/ws', async (ctx) => {
      try {
        const socket = new SkylinkWebsocket(ctx.websocket, this.publicEnv);
      } catch (err) {
        console.log('ws accept error:', err);
      }
    }));
  }
}

class SkylinkWebsocket {
  constructor(webSocket, publicEnv) {
    this.webSocket = webSocket;

    // create a new environment just for this connection
    this.env = new Environment();
    //this.env.bind('/tmp', new TemporaryMount);
    this.env.bind('/pub', publicEnv);
    // (async()=>{
    //   console.log('env', await this.env.getEntry('/pub/sessions'))
    // })();

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
