const {join} = require('path');

const {WebServer} = require('./web-server.js');
const {FireContext, mainCredName} = require('./firebase.js');
const {DefaultSite} = require('./default-site.js');
const {DoorwaySite} = require('./doorway-site.js');
const {UnclaimedSite} = require('./unclaimed-site.js');
const {ExportSite} = require('./export-site.js');

(async () => {

  const firebase = new FireContext(mainCredName);
  const web = new WebServer(fqdn => firebase.selectDomain(fqdn));
  await firebase.bootstrap();

  const compose = require('koa-compose');
  const unclaimedSite = new UnclaimedSite(firebase);
  const unclaimedMiddleware = compose(unclaimedSite.koa.middleware);
  web.koa.use((ctx, next) => {
    if (ctx.state.domain.hasAccessTerm('unclaimed')) {
      return unclaimedMiddleware(ctx, () => {});
    }
    return next();
  });

  //web.mountStatic('/~/doorway', join(__dirname, '..', 'web', 'doorway'));
  web.mountStatic('/~~/panel', join(__dirname, '..', 'web', 'panel'));
  web.mountStatic('/~~/editor', join(__dirname, '..', 'web', 'editor'));
  // web.mountStatic('/~/handle/:handle/editor', join(__dirname, '..', 'web', 'editor'));
  // web.mountStatic('/~/handle/:handle/panel', join(__dirname, '..', 'web', 'panel'));

  web.mountApp('/~', new DoorwaySite(firebase));
  web.mountApp('/~~export', new ExportSite(firebase));
  web.mountStatic('/~~vendor', join(__dirname, '..', 'web', 'vendor'));

  web.koa.use(async (ctx, next) => {
    const entry = await ctx.state.domain.findWebEntry(ctx);
    if (entry) {
      // console.log({entry});
      switch (entry.Type) {
        case 'Blob':
          ctx.set('content-type', entry.Mime);
          ctx.body = Buffer.from(entry.Data, 'base64');
          return;
        case 'String':
          ctx.redirect(entry.StringValue);
          return;
        default:
          ctx.throw(500, `Tried serving weird entry Type ${entry.Type}`);
      }
    }

    web.mountApp('/', new DefaultSite(firebase));
    return next();
  });

  console.log('App listening on', await web.listen(9239));

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
