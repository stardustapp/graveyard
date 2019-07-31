const http = require('http');
const { once } = require('events');

const Koa = require('koa');
const mount = require('koa-mount');
const route = require('koa-route');
const serve = require('koa-static');
const websockify = require('koa-websocket');

exports.WebServer = class WebServer {
  constructor(domainSrc) {
    this.koa = websockify(new Koa());

    this.koa.use(this.logRequest.bind(this));
    this.koa.use(this.annotateResponseTime.bind(this));
    this.koa.use(this.handleAnyError.bind(this));

    this.koa.use(route.get('/healthz', async ctx => {
      ctx.body = 'ok';
    }));

    this.domainSrc = domainSrc;
    this.koa.use(this.attachDomain.bind(this));
    this.koa.ws.use(this.attachDomain.bind(this));
  }

  mountApp(prefix, app) {
    this.koa.use(mount(prefix, app.koa));
    if (app.koa.ws) {
      this.koa.ws.use(mount(prefix, app.koa.ws));
    }
  }

  mountStatic(prefix, fsPath) {
    this.koa.use(mount(prefix, serve(fsPath)));
  }

  async listen(...args) {
    // TODO: better way of always putting this at the end?
    // just fork? https://github.com/kudos/koa-websocket/blob/master/index.js
    this.koa.ws.use(function (ctx) {
      ctx.websocket.close(4004, `ERROR: route '${ctx.url}' is not implemented`);
    });

    this.http = http.createServer(this.koa.callback());
    this.koa.ws.listen({ server: this.http });

    const promise = once(this.http, 'listening');
    this.http.listen(...args);
    await promise;

    return this.http.address();
  }

  async logRequest(ctx, next) {
    await next();
    const rt = ctx.response.get('X-Response-Time');
    const user = ctx.state.claims ? ctx.state.claims.uid : 'anon';
    const rst = ctx.response.status;
    console.log(`${rst} ${user} - ${ctx.method} ${ctx.url} - ${rt}`);
  }

  async annotateResponseTime(ctx, next) {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.set('X-Response-Time', `${ms}ms`);
  }

  handleAnyError(ctx, next) {
    return next().catch(err => {
      const { status, expose, message, ...extra } = err;
      if (!expose) return Promise.reject(err);

      ctx.type = 'json';
      ctx.status = status || 500;
      ctx.body = {
        error: err.constructor.name,
        message,
        ...extra,
      };

      ctx.app.emit('error', err, ctx);
    });
  }

  async attachDomain(ctx, next) {
    const {hostname} = ctx.request;
    ctx.state.domain = await this.domainSrc(hostname);
    if (!ctx.state.domain) ctx.throw(421,
      `${hostname} does not exist on this server`);
    return next();
  }
};
