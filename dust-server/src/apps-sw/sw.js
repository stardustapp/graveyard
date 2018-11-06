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
  //'/~~libs/vendor/libraries/fengari.js',
  //'/~~libs/vendor/libraries/moment.js',
  `/~~libs/vendor/libraries/common-tags.js`,
  //'/~~libs/vendor/libraries/bugsnag.js',

  '/~~src/core/platform-api.js',
);
delete this.window;

//fetch('/~/apps/~~/list%20accounts', {method:'post',body:'asdf=34',headers:{'content-type':'application/x-www-form-urlencoded'}})

const SHELL_CACHE = 'shell-cache-v1';

self.addEventListener('install', function(event) {
  event.waitUntil(async function() {

    const shellCache = await caches.open(SHELL_CACHE);
    await shellCache.addAll([
      '/~~libs/vendor/fonts/material-icons.css',
      '/~~libs/vendor/fonts/woff2/material-icons.woff2',
      '/~~libs/vendor/fonts/roboto.css',
      '/~~libs/vendor/fonts/woff2/roboto-latin.woff2',
      '/~~libs/vendor/libraries/vue.js',
      '/~~libs/vendor/libraries/moment.js',

      '/~~libs/core/combined.js',
      '/~~libs/vue/vue-app.js',
      '/~~libs/vue/vue-app.css',
      '/~~libs/vue/vue-toolbox.js',
    ]);

    await self.skipWaiting(); // take new pageloads
    console.log('installed!');
  }());
});

self.addEventListener('activate', function(event) {
  event.waitUntil(async function() {

    const cacheWhitelist = [SHELL_CACHE];
    const cacheNames = await caches.keys();
    for (const cacheName of cacheNames) {
      if (!cacheWhitelist.includes(cacheName)) {
        await caches.delete(cacheName);
      }
    }

    console.log('activated!');
  }());
});

self.addEventListener('fetch', event => {
  event.respondWith(async function() {
    const {destination, method, url} = event.request;
    const uri = PathFragment.parseUri(url);
    console.log('sw', method, uri.path.parts);
    if (destination === 'document' && method === 'GET') {

      // pass apps API requests directly upstream to help debugging
      //if (uri.path.startsWith('/~/apps/~~')) {
      //  return fetch(event.request);
      //}

      var match;
      switch (true) {
        case (match = uri.path.matchWith('/~/apps/:app')).ok:
          const appName = match.params.get('name');
          console.log('loading application', appName);

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
          break;
      }
    }

    const shellCache = await caches.open(SHELL_CACHE);
    const cacheHit = await shellCache.match(event.request);
    if (cacheHit) {
      console.log('serving from cache', uri.path.parts);
      return cacheHit;
    }

    console.log('passing upstream', uri.path.parts);
    return fetch(event.request);
  }());
});