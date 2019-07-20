const {join} = require('path');

const {DustDomain, mainCredName} = require('./dust-domain.js');
const {DefaultSite} = require('./default-site.js');
const {DoorwaySite} = require('./doorway-site.js');
const {ExportSite} = require('./export-site.js');

const domain = new DustDomain(mainCredName);

(async () => {

  // var projectManagement = adminApp.projectManagement();
  // console.log(await projectManagement.listAppMetadata());

  //const confDb = adminApp.database();

  const Koa = require('koa');
  const mount = require('koa-mount');
  const route = require('koa-route');
  const serve = require('koa-static');
  const websockify = require('koa-websocket');

  const app = websockify(new Koa());

  app.use(async (ctx, next) => {
    await next();
    const rt = ctx.response.get('X-Response-Time');
    const user = ctx.state.claims ? ctx.state.claims.uid : 'anon';
    const rst = ctx.response.status;
    console.log(`${rst} ${user} - ${ctx.method} ${ctx.url} - ${rt}`);
  });

  app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.set('X-Response-Time', `${ms}ms`);
  });

  //app.use(mount('/~/doorway/', serve(join(__dirname, 'web', 'doorway'))));
  app.use(mount('/~~vendor/', serve(join(__dirname, 'web', 'vendor'))));
  app.use(mount('/~~/panel/', serve(join(__dirname, 'web', 'panel'))));
  app.use(mount('/~~/editor/', serve(join(__dirname, 'web', 'editor'))));
  //app.use(route.get('/~:username/editor/'), serve(join(__dirname, 'web', 'editor')));

  app.use(route.get('/healthz', async ctx => {
    ctx.body = 'ok';
  }));

  app.use(mount('/~', new DoorwaySite(domain).koa));
  app.use(mount('/', new DefaultSite(domain).koa));

  app.use(mount('/~~export', new ExportSite(domain).koa));
  app.ws.use(mount('/~~export', new ExportSite(domain).koa.ws));

  app.ws.use(function (ctx) {
    //ctx.websocket.send('404');
    ctx.websocket.close(4004, `ERROR: route '${ctx.url}' is not implemented`);
  });

  app.listen(9239);
  console.log('App listening on', 9239);

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
