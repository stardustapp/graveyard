this.window = this;
importScripts(
  '/~~src/core/api-entries.js',
  '/~~src/core/environment.js',
  '/~~src/core/enumeration.js',
  '/~~src/core/utils.js',
/*
  '/~~src/devices/tmp.js',
  '/~~src/devices/skylink-import.js',

  '/~~src/webapp/core/data/channel.js',
  '/~~src/webapp/core/data/subs/_base.js',
  '/~~src/webapp/core/data/subs/single.js',
  '/~~src/webapp/core/skylink/ns-convert.js',

  '/~~src/skylink/client.js',
  '/~~src/skylink/server.js',
  '/~~src/skylink/core-ops.js',
  '/~~src/skylink/ext-channel.js',
  '/~~src/skylink/ext-reversal.js',
  '/~~src/skylink/channel-client.js',
  '/~~src/skylink/channel-server.js',
  '/~~src/skylink/messageport.js',
*/
  '/~~src/lib/caching.js',
  //'/~~src/lib/tracing.js',
  //'/~~src/lib/mkdirp.js',
  '/~~src/lib/path-fragment.js',
  //'/~~src/lib/datadog.js',

  '/~~libs/vendor/libraries/base64.js',
  '/~~libs/vendor/libraries/moment.js',
  '/~~libs/vendor/libraries/common-tags.js',
  '/~~libs/vendor/libraries/idb.js',
  '/~~libs/vendor/libraries/aws-sdk.js',
  '/~~libs/vendor/libraries/sw-xhr.js',

  //'/~~src/core/platform-api.js',

  '/~~src/model/test.js',
  '/~~src/model/core.js',
  '/~~src/model/impl/application.js',
  '/~~src/model/impl/application_test.js',
  //'/~~src/vcs/version-control.js',
  //'/~~src/vcs/workdir.js',

  //'/~~src/apps-sw/software-db.js',
  '/~~src/apps-sw/kernel.js',
);
delete this.window;

const testSuite = vcsTests;

self.addEventListener('install', function(event) {
  self.skipWaiting();
});
//self.addEventListener('activate', function(event) {
//  console.log('sw activated');
//});
/*
self.addEventListener('fetch', function(event) {
  event.respondWith(async function() {
    if (event.request.destination == 'document') {
      setTimeout(() => testSuite.runAll(), 100);
    }
    return fetch(event.request);
  }());
});
*/


//fetch('/~/apps/~~/list%20accounts', {method:'post',body:'asdf=34',headers:{'content-type':'application/x-www-form-urlencoded'}})
/*
const SHELL_CACHE = 'shell-cache-v1'; 

self.addEventListener('install', function(event) {
  event.waitUntil(async function boot() {
    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.addAll([
      '/~~libs/vendor/fonts/material-icons.css',
      '/~~libs/vendor/fonts/woff2/material-icons.woff2',
      '/~~libs/vendor/fonts/roboto.css',
      '/~~libs/vendor/fonts/woff2/roboto-latin.woff2',
      '/~~libs/vendor/fonts/fira-code.css',
      // todo fira

      '/~~libs/vendor/libraries/vue.js',
      '/~~libs/vendor/libraries/vue-router.js',
      '/~~libs/vendor/libraries/vue-codemirror.js',
      '/~~libs/vendor/libraries/moment.js',

      '/~~libs/core/combined.js',
      '/~~libs/vue/vue-app.js',
      '/~~libs/vue/vue-app.css',
      '/~~libs/vue/vue-toolbox.js',

      // '/~/apps/builder/app.css',
      // '/~/apps/builder/app.js',

      '/~~libs/vendor/codemirror/codemirror.css',
      '/~~libs/vendor/codemirror/themes/tomorrow-night-bright.css',
      '/~~libs/vendor/codemirror/codemirror.js',
      '/~~libs/vendor/codemirror/codemirror-mode.js',
      '/~~libs/vendor/codemirror/modes/css.js',
      '/~~libs/vendor/codemirror/modes/javascript.js',
      '/~~libs/vendor/codemirror/modes/htmlmixed.js',
      '/~~libs/vendor/codemirror/modes/vue.js',

      '/~~src/lib/path-fragment.js',

      '/~/style.css',
    ]);

    // take new pageloads immediately
    await self.skipWaiting();
  }());
});
*/
const kernel = new Kernel();

self.addEventListener('activate', function(event) {
  event.waitUntil(async function() {

    // Bring up the 'system'
    kernel.ready = kernel.init();
    await kernel.ready;

    /*
    // Clear out old caches
    const cacheWhitelist = [SHELL_CACHE];
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (!cacheWhitelist.includes(cacheName)) {
        console.warn('Deleting unrecognized SW cache', cacheName);
        await caches.delete(cacheName);
      }
    }
    */
  }());
});

class PathRouter {
  constructor() {
    this.routes = [];
  }
  registerHandler(pattern, handler) {
    const path = PathFragment.from(pattern);
    if (this.routes.find(x => x.path.equals(path))) {
      throw new Error(`Tried double-registering '${pattern}' in router`);
    }
    this.routes.push({path, handler});
  }
  async routeInput(path, input, fallbackCb) {
    for (const route of this.routes) {
      const match = path.matchWith(route.path);
      if (match.ok) {
        if (!route.path.toString().includes('xhr'))
          console.debug(`Matched ${path} to ${route.path} with`, match.params);
        input.params = match.params;
        try {
          return await route.handler(match, input);
        } catch (err) {
          return new Response(err.stack, {
            status: 500,
            headers: {
              'Content-Type': 'text/plain',
            },
          });
        }
      }
    }
    console.warn(`Didn't match ${path}, falling back`);
    return fallbackCb(input);
  }
}

const destinations = {
  documentGET: new PathRouter,
  documentPOST: new PathRouter,
  //styleGET: new PathRouter,
  //unknownGET: new PathRouter,
}
/*
destinations.documentGET.registerHandler('/~/apps/', async match => {
  const allPkgs = await kernel.softwareDB.listAllPackages();
  let pkgListing = allPkgs.map(record => commonTags.safeHtml`
    <li style="display: flex;">
      <a href="by-id/${record.pid}" style="flex: 1;">${record.displayName}</a>
      <a href="builder/?id=${record.pid}">
        <i class="material-icons">edit</i>
      </a>
      <a href="delete?id=${record.pid}">
        <i class="material-icons">delete</i>
      </a>
    </li>
  `).join('\n');
  if (!allPkgs.length) {
    pkgListing = commonTags.safeHtml`<li style="display: flex;">None yet</li>`;
  }

  return wrapGatePage('Apps Home', commonTags.html`
    <div style="display: flex;">
      <section class="compact modal-form">
        <h2>Your apps</h2>
        <ul style="text-align: left; margin: 0; padding: 0 0.5em;">
          ${pkgListing}
        </ul>
        <a href="store/browse" class="action">
          Download app from store
        </a>
        <a href="new-package?type=webapp" class="action">
          Start developing new app
        </a>
      </section>
    </div>`);
});

destinations.documentGET.registerHandler('/~/apps/new-package', async (_, {uri}) => {
  return wrapGatePage(`Create Package`, commonTags.safeHtml`
    <style type="text/css">
      label { text-align: left; }
      input, select { flex: 1; }
      .modal-form .row label { margin-right: 0; }
      .row { margin-left: 1em; }
    </style>
    <form method="post" class="modal-form" style="max-width: 70em;">
      <h1>create package</h1>
      <div class="row">
        <label for="displayName">display name</label>
        <input type="text" name="displayName" required autofocus>
      </div>
      <div class="row">
        <label for="type">package type</label>
        <select name="type" required>
          <option value="webapp" selected>Web application</option>
          <option value="backend" disabled>Backend service</option>
          <option value="library" disabled>Resource library</option>
        </select>
      </div>
      <div class="row">
        <label for="sourceLicense">source code license</label>
        <input type="text" name="sourceLicense" value="MIT" required>
      </div>
      <div class="row">
        <label for="iconUrl">icon URL</label>
        <input type="text" name="iconUrl">
      </div>
      <button type="submit">
        start development
      </button>
    </form>
    <div style="align-self: center;">
      <a href=".">return home</a>
    </div>`);
});

destinations.documentPOST.registerHandler('/~/apps/new-package', async (_, {request}) => {
  const data = await request.formData();
  const pkg = await kernel.softwareDB.createPackage({
    displayName: data.get('displayName'),
    type: data.get('type'),
    sourceLicense: data.get('sourceLicense'),
    iconUrl: data.get('iconUrl'),
  });
  return Response.redirect(`/~/apps/builder/?id=${pkg.pid}`);
});
*/

destinations.documentGET.registerHandler('/~/apps/test-suite', match => {
  setTimeout(() => testSuite.runAll(), 100);
  return new Response('test suite');
});

destinations.documentGET.registerHandler('/~/apps/by-id/:appId', match => {
  const appId = match.params.get('appId');
  return Response.redirect(`/~/apps/by-id/${appId}/home`);
});

destinations.documentGET.registerHandler('/~/apps/by-id/:appId/:*rest', async (match, input) => {
  const appId = match.params.get('appId');
  let project;
  try {
    await kernel.graphStore.deleteProject(appId);
    project = await kernel.graphStore.loadProject(appId);
  } catch (err) {
    console.error('Project failed to load, attempting to install:', err);
    const repo = new S3ApplicationRepository();
    const package = await repo.fetchPackage(appId);
    await ImportLegacyStardustApplication(kernel.graphStore, package);
    project = await kernel.graphStore.loadProject(appId);
  }
  const application = Array
    .from(project.objects.values())
    .find(x => x.record.config.name === 'Application');
  if (!application) throw new Error(`app-missing:
    Project '${appId}' does not contain a web application.`);
  //return new Response(JSON.stringify(res, null, 2));
  return application.renderHtmlResponse(input);

  //console.log('loading application', appId, application.record.config);

  /*const {accounts} = await fetch('/~/apps/~~/list%20accounts').then(x => x.json());
  if (accounts.length === 0) {
    return new Response('please sign in');
  }
  console.log('account', accounts[0]);*/

/*
  return new Response(commonTags.html`<!doctype html>
<title></title>
<link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vue/vue-app.css" type="text/css" rel="stylesheet">
<link href="app.css" type="text/css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
<div id="app">
<sky-session></sky-session>
<!-- TODO: the app -->
</div>
<script src="/~~libs/vendor/libraries/vue.js"></script>
<script src="/~~libs/core/combined.js"></script>
<!--script src="/~~libs/vue/vue-app.js"></script-->
`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  */
});

const ddpApi = new PathRouter;

ddpApi.registerHandler('/sockjs/info', async match => {
  var array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return new Response(JSON.stringify({
    websocket: false,
    origins: ['*:*'],
    cookie_needed: false,
    entropy: array[0],
  }));
});

ddpApi.registerHandler('/sockjs/:server/:session/xhr', async ({params}, {request}) => {
  const sessionId = params.get('session');
  if (ddpSessions.has(sessionId)) {
    const session = ddpSessions.get(sessionId);
    return session.nextPollResponse();
  } else {
    const session = new DDPSession(params.get('server'), sessionId);
    ddpSessions.set(sessionId, session);
    return new Response('o\n');
  }
});

ddpApi.registerHandler('/sockjs/:server/:session/xhr_send', async ({params}, {request}) => {
  const sessionId = params.get('session');
  //console.log(Array.from(ddpSessions.keys()), sessionId, ddpSessions.has(sessionId));
  if (ddpSessions.has(sessionId)) {
    const session = ddpSessions.get(sessionId);
    await session.processPollSend(await request.json());
    return new Response(null, {status: 204});
  } else {
    return new Response('no such session', {status: 400});
  }
});

class DDPSession {
  constructor(serverId, sessionId) {
    this.serverId = serverId;
    this.sessionId = sessionId;
    this.outboundQueue = [];
    this.waitingPoll = null;
    this.closePacket = null; // [1000, 'Normal closure']
  }

  queueResponses(...packets) {
    console.log('>>>', packets);
    packets = packets.map(p => JSON.stringify(p));
    if (this.waitingPoll) {
      const resolve = this.waitingPoll;
      this.waitingPoll = null;
      resolve(new Response(`a${JSON.stringify(packets)}\n`));
    } else {
      packets.forEach(packet => {
        this.outboundQueue.push(packet);
      });
    }
  }

  async processPollSend(input) {
    input.map(JSON.parse).forEach(packet => {
      console.log('xhr input', packet);
      switch (packet.msg) {
        case 'connect':
          // get version and support array
          if (packet.version !== '1') throw new Error(
            `bad sockjs version ${packet.version}`);
          this.queueResponses(
            {server_id: "0"},
            {msg: "connected", session: "GH3zpGwZpCTyXQMgg"},
          );
          break;
        case 'ping':
          this.queueResponses({msg: 'pong'});
          break;
        default:
          console.warn('weird sockjs packet', packet);
      }
    });
  }

  async nextPollResponse() {
    // immediate return if closed
    if (this.closePacket && this.outboundQueue.length === 0) {
      return new Response(`c${this.closePacket}\n`);
    }

    // immediate return if data is queued
    if (this.outboundQueue.length) {
      const queue = this.outboundQueue;
      this.outboundQueue = [];
      return new Response(`a${JSON.stringify(queue)}\n`);
    }

    // wait for new stuff
    return new Promise(resolve => {
      setTimeout(() => {
        if (this.waitingPoll === resolve) {
          this.waitingPoll = null;
          resolve(new Response('h\n'));
          console.debug('keeping alive xhr');
        }
      }, 5000);
      if (this.waitingPoll) throw new Error(
        `concurrent xhr polling??`);
      this.waitingPoll = resolve;
    });

    //const sleep = m => new Promise(r => setTimeout(r, m));
    //await sleep(30000);
    //return new Response('h\n');
  }
}
const ddpSessions = new Map;

/*
const softwareApi = new PathRouter;

softwareApi.registerHandler('/get%20package/:pkgId', async (match) => {
  const pkgId = match.params.get('pkgId');
  const pkg = await kernel.softwareDB.getPackage(pkgId);
  return new Response(JSON.stringify(pkg));
});
softwareApi.registerHandler('/list%20resources/:pkgId', async (match) => {
  const pkgId = match.params.get('pkgId');
  const pkg = await kernel.softwareDB.getPackage(pkgId);
  return new Response(JSON.stringify(pkg.meta));
});
*/

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    await kernel.ready;
    const {destination, method, url} = event.request;

    const uri = PathFragment.parseUri(url);
    //console.log(uri, event.request);

    // intercept the api
    if (uri.host === 'ddp') {
      return ddpApi.routeInput(uri.path, {
        request: event.request,
        uri: uri,
      }, () => new Response('404', {status: 404}))
    }

    // no interception for cross-domain stuff!
    if (!url.startsWith(location.origin)) {
      return fetch(event.request);
    }
/*
    // pass apps API requests directly upstream to help debugging
    if (uri.path.startsWith('/~/apps/~~')) {
      return fetch(event.request);
    }

    // serve from cache if we explicitly cached it
    if (method == 'GET') {
      const shellCache = await caches.open(SHELL_CACHE);
      const cacheHit = await shellCache.match(event.request);
      if (cacheHit) {
        //console.debug('serving from cache', uri.path.parts);
        return cacheHit;
      }
    }
*/
    // the fallback is proxying to the server
    function fallback() {
      console.warn('passing upstream', destination, method, `upstream: ${uri.path}`);
      return fetch(event.request);
    }

    // route if we have a router, with the server as fallback
    const destRouter = destinations[destination + method];
    if (destRouter) {
      return destRouter.routeInput(uri.path, {
        request: event.request,
        uri: uri,
      }, fallback);
    } else {
      return fallback();
    }
  }());
});

function wrapGatePage(title, inner) {
  return new Response(commonTags.safeHtml`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
      <link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
      <link href="/~/style.css" type="text/css" rel="stylesheet" media="screen,projection" />
    </head>
    <body>
      `+'\n\n  '+inner.split('\n').join('\n  ')+'\n\n  '+commonTags.safeHtml`

      <div class="fill"></div>

      <footer>
        powered by the Stardust platform,
        built by
        <a href="http://danopia.net">danopia</a>
      </footer>
    </body>
    </html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
