this.window = this;
importScripts(
  '/~~src/core/api-entries.js',
  '/~~src/core/environment.js',
  '/~~src/core/enumeration.js',
  '/~~src/core/utils.js',

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

  '/~~src/lib/caching.js',
  '/~~src/lib/tracing.js',
  '/~~src/lib/mkdirp.js',
  '/~~src/lib/path-fragment.js',
  '/~~src/lib/datadog.js',

  '/~~libs/vendor/libraries/base64.js',
  '/~~libs/vendor/libraries/moment.js',
  '/~~libs/vendor/libraries/common-tags.js',
  '/~~libs/vendor/libraries/idb.js',

  '/~~src/core/platform-api.js',

  '/~~src/apps-sw/software-db.js',
  '/~~src/apps-sw/kernel.js',
);
delete this.window;

//fetch('/~/apps/~~/list%20accounts', {method:'post',body:'asdf=34',headers:{'content-type':'application/x-www-form-urlencoded'}})

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

const kernel = new Kernel();

self.addEventListener('activate', function(event) {
  event.waitUntil(async function() {

    // Bring up the 'system'
    kernel.ready = kernel.init();
    await kernel.ready;

    // Clear out old caches
    const cacheWhitelist = [SHELL_CACHE];
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (!cacheWhitelist.includes(cacheName)) {
        console.warn('Deleting unrecognized SW cache', cacheName);
        await caches.delete(cacheName);
      }
    }
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
        console.log(`Matched ${path} to ${route.path} with`, match.params);
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

destinations.documentGET.registerHandler('/~/apps/by-id/:appId', match => {
  const appId = match.params.get('appId');
  return Response.redirect(`/~/apps/${appId}/`);
});

destinations.documentGET.registerHandler('/~/apps/by-id/:appId/', async match => {
  const appId = match.params.get('appId');
  const pkg = await kernel.softwareDB.getPackage(appId);
  return new Response(JSON.stringify(pkg, null, 2));

  /*
  console.log('loading application', appId);

  const {accounts} = await fetch('/~/apps/~~/list%20accounts').then(x => x.json());
  if (accounts.length === 0) {
    return new Response('please sign in');
  }
  console.log('account', accounts[0]);

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

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    await kernel.ready;
    const {destination, method, url} = event.request;

    const uri = PathFragment.parseUri(url);
    //console.log(uri, event.request);

    // intercept the api
    if (uri.host === 'software-api') {
      return softwareApi.routeInput(uri.path, {
        request: event.request,
        uri: uri,
      }, () => new Response('404', {status: 404}))
    }

    // no interception for cross-domain stuff!
    if (!url.startsWith(location.origin)) {
      return fetch(event.request);
    }

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
