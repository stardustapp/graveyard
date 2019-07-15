const {join} = require('path');

const {DustDomain, mainCredName} = require('./dust-domain.js');
const {DefaultSite} = require('./default-site.js');
const {DoorwaySite} = require('./doorway-site.js');

const domain = new DustDomain(mainCredName);

(async () => {

  // var projectManagement = adminApp.projectManagement();
  // console.log(await projectManagement.listAppMetadata());

  // const clientApp = spawnClientApp(credentialName);
  // // const cred = await clientApp.auth()
  // //   .createUserWithEmailAndPassword('dan@danopia.net', 'hunter2');
  // const user = await clientApp.auth()
  //   .signInWithEmailAndPassword('dan@danopia.net', 'hunter2');
  // //console.log('user', user);
  // //console.log('cred', user.additionalUserInfo);
  // const idToken = await user.user.getIdToken();
  // console.log('cred', idToken);
  // await clientApp.delete();
  // const expiresIn = 60 * 60 * 24 * 5 * 1000;
  // const sessionCookie = await adminApp.auth()
  //   .createSessionCookie(idToken, {expiresIn});
  // console.log('cookie', sessionCookie);

  //const confDb = adminApp.database();

  const Koa = require('koa');
  const mount = require('koa-mount');
  //const cookie = require('koa-cookie');
  const route = require('koa-route');
  const serve = require('koa-static');
  const websockify = require('koa-websocket');

  const app = websockify(new Koa());
  //app.use(cookie());

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
  //app.use(route.get('/~:username/editor/'), serve(join(__dirname, 'web', 'editor')));

  // app.use(route.post('/~/app-session', async ctx => {
  //   ctx.body = 'Hello World';
  //   // admin.auth().verifySessionCookie(
  //   // sessionCookie, true /** checkRevoked */)
  //   // .then((decodedClaims) => {
  // }));

  app.use(mount('/~', new DoorwaySite(domain).koa));
  app.use(mount('/', new DefaultSite(domain).koa));

  app.ws.use(route.all('/test/:id', function (ctx) {
    // `ctx` is the regular koa context created from the `ws` onConnection `socket.upgradeReq` object.
    // the websocket is added to the context on `ctx.websocket`.
    ctx.websocket.send('Hello World');
    ctx.websocket.on('message', function(message) {
      // do something with the message from client
          console.log(message);
    });
  }));

  app.listen(9239);
  console.log('App listening on', 9239);

})().then(() => {/*process.exit(0)*/}, err => {
  console.error();
  console.error('!-> Daemon crashed:');
  console.error(err.stack || err);
  process.exit(1);
});
