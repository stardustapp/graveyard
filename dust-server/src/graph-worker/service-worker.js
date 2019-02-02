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
  '/~~libs/vendor/libraries/aws-sdk.js',
  '/~~libs/vendor/libraries/sw-xhr.js',

  '/~~src/graph-worker/lib.js',
  '/~~src/graph-worker/ddp.js',

  '/~~src/model/field-types.js',
  '/~~src/model/engine.js',
  '/~~src/model/engine_builder.js',
  '/~~src/model/graph.js',
  '/~~src/model/graph_builder.js',
  '/~~src/model/transaction.js',
  '/~~src/model/store.js',

  '/~~src/model/impl/app-profile/model.js',

  '/~~src/model/impl/dust-app/model.js',
  '/~~src/model/impl/dust-app/json-codec.js',
  '/~~src/model/impl/dust-app/repository.js',
  '/~~src/model/impl/dust-app/compile.js',

  '/~~src/model/impl/lua-machine/model.js',
);

class GraphContext {
  constructor(worker, graph) {
    this.worker = worker;
    this.graph = graph;
    this.sessions = [];
  }

  connectSession(session) {
    this.sessions.push(session);
    /*
    session.queueResponses({
      msg: 'added',
      collection: 'records',
      id: 'CZevr7ikH6AGhvDc5',
      fields: {
        type: 'Sentiment',
        packageId: 'diary',
        version: 1,
        scope: 'global',
        Code: 'fantastic',
        Label: 'amazing, fantastic day',
        Color: 'pink',
      }
    });
    session.queueResponses({
      msg: 'added',
      collection: 'records',
      id: 'E35kkKwQSLQa72wsH',
      fields: {
        type: 'DayOverview',
        packageId: 'diary',
        version: 23,
        scope: 'global',
        createdAt: {$date: 1546405175948},
        updatedAt: {$date: 1547535604661},
        Date: '2019-01-01',
        SentimentCode: [ 'stressed' ],
        Highlight: 'Diary creation sprint',
      }
    });
    session.queueResponses({
      msg: 'added',
      collection: 'records',
      id: 'QbthKyNHjeCoxuhWR',
      fields: {
        type: 'MealEntry',
        createdAt: {$date: 1546419753713},
        updatedAt: {$date: 1546832841093},
        packageId: 'diary',
        version:10,
        scope: 'global',
        Timestamp: {$date: 1546378200000},
        SentimentCode: 'fantastic',
        Foods: ['brown rice', 'garlic naan', 'chana masala', 'daal', 'spicy veggie chicken'],
        Drinks: ['water'],
        MealSize: 'Large meal',
        Origin: 'samosa house',
      },
      cleared: ['EndTime'],
    });
    */
  }
}

class GraphWorker {;
  constructor() {
    this.graphStore = new GraphStore();
    this.ddp = new DDPManager(async appId => {
      console.warn('Creating context for', appId);
      const graph = await this.graphStore.loadGraph(appId);
      const context = new GraphContext(this, graph);
      return context;
    });

    this.ready = Promise.all([
      this.graphStore.ready,
    ]);
  }
}
let graphWorker;

const SHELL_CACHE = 'shell-cache-v1';

self.addEventListener('install', function(event) {
  event.waitUntil(async function boot() {

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

        '/~~libs/vendor/libraries/meteor-bundle.js',
      ]);
    }

    // take new pageloads immediately
    await self.skipWaiting();
  }());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(async function() {

    graphWorker = new GraphWorker();
    await graphWorker.ready;

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
  //styleGET: new PathRouter,
  //unknownGET: new PathRouter,
}

destinations.documentGET.registerHandler('/~/apps/by-id/:appId', match => {
  const appId = match.params.get('appId');
  return Response.redirect(`/~/apps/by-id/${appId}/home`);
});

destinations.documentGET.registerHandler('/~/apps/by-id/:appId/:*rest', async (match, input) => {
  const appId = match.params.get('appId');

  // get the app
  const store = graphWorker.graphStore;
  const engine = GraphEngine.get('dust-app/v1-beta1');

  // clear everything if testing installation
  //await store.transact('readwrite', txn => txn.purgeEverything());

  let graph = await store.findOrCreateGraph(engine, {
    fields: {
      heritage: 'stardust-poc',
      origin: `https://stardust-repo.s3.amazonaws.com/packages/${encodeURIComponent(appId)}.json`,
    },
    async buildCb(engine, {origin}) {
      // fill out a graphBuilder for the app
      const repoResp = await fetch(origin);
      if (repoResp.status !== 200) throw new Error(
        `Stardust Cloud Repo returned HTTP ${repoResp.status}`);
      const manifest = await repoResp.json();
      const graphBuilder = DustAppJsonCodec.inflate(manifest);
      return graphBuilder;
    },
  });

  console.log('have graph', graph);
  return CompileDustApp(graph, input);
});

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    await graphWorker.ready;
    const {destination, method, url} = event.request;

    const uri = PathFragment.parseUri(url);
    //console.log(uri, event.request);

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
  }());
});
