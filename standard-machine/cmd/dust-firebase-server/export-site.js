const Koa = require('koa');
const route = require('koa-route');
const commonTags = require('common-tags');
const websockify = require('koa-websocket');

exports.ExportSite = class ExportSite {
  constructor(domain) {
    if (!domain)
      throw new Error(`ExportSite requires a domain`);
    this.domain = domain;
    // this.koa = new Koa();

    const websockify = require('koa-websocket');
    this.koa = websockify(new Koa());

    this.koa.use(route.get('/', async ctx => {
      ctx.response.body = {};
    }));

    this.koa.use(route.get('/ping', async ctx => {
      ctx.response.body = 'ok';
    }));

    this.koa.ws.use(route.all('/ws', function (ctx) {

      ctx.websocket.on('message', function(message) {
        const request = JSON.parse(message);
        switch (request.Op) {
          case 'ping':
            ctx.websocket.send(JSON.stringify({Op: 'pong'}));
            break;
          default:
            console.log('unimpl op:', request);
        }
      });
    }));

  }
}
