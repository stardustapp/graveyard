const {join} = require('path');

const {WebServer} = require('./web-server.js');
const {DustDomain, mainCredName} = require('./dust-domain.js');
const {DefaultSite} = require('./default-site.js');
const {DoorwaySite} = require('./doorway-site.js');
const {ExportSite} = require('./export-site.js');

const domain = new DustDomain(mainCredName);

(async () => {

  const web = new WebServer;

  //web.mountStatic('/~/doorway/', join(__dirname, '..', 'web', 'doorway'));
  web.mountStatic('/~~vendor/', join(__dirname, '..', 'web', 'vendor'));
  web.mountStatic('/~~/panel/', join(__dirname, '..', 'web', 'panel'));
  web.mountStatic('/~~/editor/', join(__dirname, '..', 'web', 'editor'));
  //web.koa.use(route.get('/~:username/editor/'), serve(join(__dirname, '..', 'web', 'editor')));

  web.mountApp('/~', new DoorwaySite(domain));
  web.mountApp('/', new DefaultSite(domain));
  web.mountApp('/~~export', new ExportSite(domain));

  console.log('App listening on', await web.listen(9239));

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
