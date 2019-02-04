console.log('%c==-----------------------------------------==', 'margin-top: 5em;');
console.log('==- S E R V I C E W O R K E R L A U N C H -==');
console.log('==-----------------------------------------==');

//Object.freeze(Object.prototype);
importScripts(
  '/~~src/lib/caching.js',
  //'/~~src/lib/tracing.js',
  //'/~~src/lib/mkdirp.js',
  '/~~src/lib/path-fragment.js',
  //'/~~src/lib/datadog.js',

  '/~~libs/vendor/libraries/base64.js',
  '/~~libs/vendor/libraries/moment.js',
  '/~~libs/vendor/libraries/common-tags.js',
  '/~~libs/vendor/libraries/idb.js',
  //'/~~libs/vendor/libraries/aws-sdk.js',
  //'/~~libs/vendor/libraries/sw-xhr.js',

  '/~~src/graph-worker/lib.js',
  '/~~src/graph-worker/ddp.js',
  '/~~src/graph-worker/shell.js',

  '/~~src/model/field-types.js',
  '/~~src/model/engine.js',
  '/~~src/model/engine_builder.js',
  '/~~src/model/graph.js',
  '/~~src/model/graph_builder.js',
  '/~~src/model/transaction.js',
  '/~~src/model/store.js',

  '/~~src/model/impl/app-profile/model.js',
  '/~~src/model/impl/app-profile/ddp-api.js',

  '/~~src/model/impl/dust-app/model.js',
  '/~~src/model/impl/dust-app/json-codec.js',
  '/~~src/model/impl/dust-app/repository.js',
  '/~~src/model/impl/dust-app/compile.js',

  '/~~src/model/impl/lua-machine/model.js',
);

class GraphWorker {
  constructor() {
    this.graphStore = new GraphStore();
    this.ddp = new DDPManager(this.graphStore, async reqUri => {
      const {path} = PathFragment.parseUri(reqUri);

      let match, graph;
      switch (true) {

        case (match = path.matchWith('/~/apps/by-id/:appId/:*rest')).ok:
          // it's a raw dust app, no data, nothing to really do
          const foreignKey = match.params.get('appId');
          graph = await this.graphStore.findGraph({
            engineKey: 'dust-app/v1-beta1',
            fields: { foreignKey },
          });
          break;

        case (match = path.matchWith('/~/apps/my/:appKey/:*rest')).ok:
          const appKey = match.params.get('appKey');
          graph = await this.graphStore.findGraph({
            engineKey: 'app-profile/v1-beta1',
            fields: { appKey },
          });
          break;

        default: throw new Error(
          `DDP request URI not recognized`);
      }

      if (graph) return graph;
      throw new Error(
        `DDP request URI didn't resolve to a graph`);
    });

    this.ready = Promise.all([
      this.graphStore.ready,
    ]);
    this.ready.then(function () {
      console.log('%c==-----------------------------------------==', 'margin-bottom: 2em;');
    });
  }
}
let graphWorker;

const SHELL_CACHE = 'shell-cache-v3';

self.addEventListener('install', function(event) {
  event.waitUntil(async function boot() {

    //await caches.delete(SHELL_CACHE); // cache deletion
    // update the cache with every entry needed
    const shellCache = await caches.open(SHELL_CACHE);
    const cachedKeys = await shellCache.keys()
    if (cachedKeys.length === 0) {
      await shellCache.addAll([
        '/~~libs/vendor/fonts/material-icons.css',
        '/~~libs/vendor/fonts/woff2/material-icons.woff2',
        '/~~libs/vendor/fonts/roboto.css',
        '/~~libs/vendor/fonts/woff2/roboto-latin.woff2',
        //'/~~libs/vendor/fonts/fira-code.css',

        '/~~src/model/impl/dust-app/runtime.js',
        '/~~libs/vendor/libraries/meteor-bundle.js',
      ]);
    }

    // take new pageloads immediately
    await self.skipWaiting();
  }());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(async function() {

    if (!graphWorker)
      graphWorker = new GraphWorker();
    await graphWorker.ready;
    console.log('ready!!!!');

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

const destinations = {
  documentGET: new PathRouter,
  documentPOST: new PathRouter,
  styleGET: new PathRouter,
  //unknownGET: new PathRouter,
}

destinations.documentGET.registerHandler('/~/apps/', (...args) => ShellSiteHome.apply(graphWorker, args));
destinations.styleGET.registerHandler('/~/apps/style.css', (...args) => ShellSiteStyle.apply(graphWorker, args));

destinations.documentGET.registerHandler('/~/apps/install-app', (...args) => ShellSiteAddAppForm.apply(graphWorker, args));
destinations.documentPOST.registerHandler('/~/apps/install-app', (...args) => ShellSiteAddAppAction.apply(graphWorker, args));

destinations.documentGET.registerHandler('/~/apps/my/:appKey/:*rest', async (match, input) => {
  const appKey = match.params.get('appKey');
  const rest = match.params.get('rest');

  if (!rest[0]) return Response
    .redirect(`/~/apps/my/${appKey}/home`);

  const store = graphWorker.graphStore;

  const appGraph = await store.findGraph({
    engineKey: 'app-profile/v1-beta1',
    fields: { appKey },
  });
  if (!appGraph) throw new Error(
    `App installation ${JSON.stringify(appKey)} not found`);

  const appInst = Array.from(appGraph.roots)[0];

  const appRouter = store.objects.get(appInst.Source.DustApp);
  if (!appRouter) throw new Error(
    `AppRouter not found`);

  const dustGraph = store.graphs.get(appRouter.data.graphId);
  if (!dustGraph) throw new Error(
    `dust-app graph not found`);

  return CompileDustApp(store, dustGraph, {
    appRoot: `/~/apps/my/${encodeURIComponent(appKey)}`,
  });
});


destinations.documentGET.registerHandler('/~/apps/by-id/:appId', match => {
  const appId = match.params.get('appId');
  return Response.redirect(`/~/apps/by-id/${appId}/home`);
});

destinations.documentGET.registerHandler('/~/apps/by-id/:appId/:*rest', async (match, input) => {
  const appId = match.params.get('appId');
  const store = graphWorker.graphStore;

  // clear everything if testing installation
  //await store.transact('readwrite', txn => txn.purgeEverything());

  const graph = await DustAppJsonCodec.installWithDeps(store, appId);
  return CompileDustApp(store, graph, {
    appRoot: `/~/apps/by-id/${encodeURIComponent(appId)}`,
    usesLegacyDB: appId.startsWith('build-'),
  });
});

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    try {
      // TODO: why do we sometimes fetch without activating?
      if (!graphWorker)
        graphWorker = new GraphWorker();

      await graphWorker.ready;
      const {destination, method, url} = event.request;

      const uri = PathFragment.parseUri(url);
      //console.log(uri, event.request);

      // serve from local cache if available
      const shellCache = await caches.open(SHELL_CACHE);
      const cachedResp = await shellCache.match(event.request)
      if (cachedResp) return cachedResp;

      // intercept the api
      if (uri.host === 'ddp') {
        return graphWorker.ddp.api.routeInput(uri.path, {
          request: event.request,
          uri: uri,
        }, () => new Response('404', {status: 404}))
      }

      // no interception for cross-domain stuff!
      if (!url.startsWith(location.origin)) {
        return fetch(event.request);
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

    } catch (err) {
      console.error('ServiceWorker fetch() crashed:', err);
      return new Response(err.stack, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  }());
});
