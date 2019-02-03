#cd ~/Code/stardust/poc/; and meteor build --debug --directory /tmp/tmp.K2EjRTOVOJ
cd /tmp/tmp.K2EjRTOVOJ/bundle/programs/web.browser/packages
cat \
  underscore.js meteor.js modules-runtime.js modules.js jquery.js \
  base64.js ejson.js check.js tracker.js id-map.js ordered-dict.js \
  promise.js ecmascript-runtime.js babel-runtime.js momentjs_moment.js \
  random.js diff-sequence.js geojson-utils.js mongo-id.js minimongo.js \
  observe-sequence.js reactive-var.js htmljs.js blaze.js reactive-dict.js \
  session.js spacebars.js templating-runtime.js ui.js check.js \
  iron_core.js iron_controller.js iron_url.js iron_location.js \
  iron_middleware-stack.js iron_dynamic-template.js iron_layout.js iron_router.js \
  html-tools.js blaze-tools.js spacebars-compiler.js \
  retry.js ddp-common.js ddp-client.js allow-deny.js mongo.js mdg_validation-error.js \
  jagi_astronomy.js jagi_astronomy-timestamp-behavior.js jagi_astronomy-slug-behavior.js \
  manuel_reactivearray.js \
| uglifyjs \
> ~/Code/chrome-profile-server/vendor/libraries/meteor-bundle.js
