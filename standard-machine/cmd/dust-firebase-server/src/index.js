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
    // console.log('domain:', .snapshot);
  });

  //web.mountStatic('/~/doorway', join(__dirname, '..', 'web', 'doorway'));
  web.mountStatic('/~~/panel', join(__dirname, '..', 'web', 'panel'));
  web.mountStatic('/~~/editor', join(__dirname, '..', 'web', 'editor'));
  // web.mountStatic('/~/handle/:handle/editor', join(__dirname, '..', 'web', 'editor'));
  // web.mountStatic('/~/handle/:handle/panel', join(__dirname, '..', 'web', 'panel'));

  web.mountApp('/~', new DoorwaySite(firebase));
  web.mountApp('/', new DefaultSite(firebase));
  web.mountApp('/~~export', new ExportSite(firebase));
  web.mountStatic('/~~vendor', join(__dirname, '..', 'web', 'vendor'));

  console.log('App listening on', await web.listen(9239));

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
