const {join} = require('path');

const {WebServer} = require('./web-server.js');
const {FireContext, mainCredName} = require('./firebase.js');
const {DefaultSite} = require('./default-site.js');
const {DoorwaySite} = require('./doorway-site.js');
const {ExportSite} = require('./export-site.js');

(async () => {

  const firebase = new FireContext(mainCredName);
  const web = new WebServer;

  // TODO: relocate
  const attachDomain = async (ctx, next) => {
    ctx.state.domain = await firebase.selectDomain(ctx.request.hostname);
    return next();
  };
  web.koa.use(attachDomain);
  web.koa.ws.use(attachDomain);

  //web.mountStatic('/~/doorway/', join(__dirname, '..', 'web', 'doorway'));
  web.mountStatic('/~~/panel/', join(__dirname, '..', 'web', 'panel'));
  web.mountStatic('/~~/editor/', join(__dirname, '..', 'web', 'editor'));
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
