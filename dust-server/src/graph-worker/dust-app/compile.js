function escapeTicks(input) {
  return input.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
const Js = JSON.stringify;

function unwrapJs(input) {
  // modern compiled script, uses 'this' as DUST
  const prolog1 = "(function() {\n  var DUST;\n\n  DUST = this;\n\n  return ";
  const epilog1 = ";\n\n});\n";
  if (input.startsWith(prolog1) && input.endsWith(epilog1)) {
    return input.slice(prolog1.length, input.length - epilog1.length).slice;
  }

  // legacy compiled script, uses 'DUST' from the env
  const prolog2 = "(function() {\n  return ";
  const epilog2 = ";\n\n}).call();\n";
  if (input.startsWith(prolog2) && input.endsWith(epilog2)) {
    return input.slice(prolog2.length, input.length - epilog2.length);
  }

  if (input.endsWith(";\n")) {
    return input.slice(0, -2);
  }
  return input;
}

async function CompileDustApp(application, input) {
  const {graphId} = application.record;

  const collectionSrc = Array
    .from(application.graph.objects.values())
    .filter(x => x.record.config.type === 'collection')
    .map(x => x.record.config)
    .map(res => {
      const fieldLines = [];
      const behaviors = [];
      for (const fieldKey in res.fields) {
        const field = res.fields[fieldKey];
        let bareType = {
          'core/string': 'String',
          'core/number': 'Number',
          'core/boolean': 'Boolean',
          'core/date': 'Date',
          'core/timestamp': 'Date',
          'core/object': 'Object',
        //TODO: }[field.type] || JSON.stringify(field.type);
        }[field.type] || 'Object';
        if (field.isList) bareType = `[${bareType}]`;

        const bits = [`type: ${bareType}`];
        if (!field.required) bits.push(`optional: true`);
        if (!field.mutable) bits.push(`immutable: true`);
        if (field.default) {
          bits.push(`default: function() { return ${Js(JSON.parse(field.default))}; }`);
        }
        fieldLines.push(`
    ${fieldKey}: { ${bits.join(', ')} },`);
      }
      let resBase = 'BaseRecord';
      switch (res.base) {
        case 'core:Record': resBase = 'BaseRecord'; break;
        case 'core:Class':  resBase = 'BaseClass';  break;
        default: if (res.base)
          resBase = `DUST.get(${Js(res.base)}, 'CustomRecord')`;
      }
      return `DUST.resources[${Js(res.name)}] = ${resBase}.inherit({
  name: ${Js(res.name)},
  fields: {${fieldLines.join('')}
  },${(behaviors.length ? `
  behaviors: ${Js(behaviors)},`:'')}
});
`;
    }).join('\n');

  const templateSrc = Array
    .from(application.graph.objects.values())
    .filter(x => x.record.config.type === 'blaze-component')
    .map(x => x.record.config)
    .map(res => {
      const scriptLines = [];
      for (const scriptKey in res.scripts) {
        const script = res.scripts[scriptKey];
        let unwrapped = script.js;
        // modern compiled script, uses 'this' as DUST
        const prolog1 = "(function() {\n  var DUST;\n\n  DUST = this;\n\n  return ";
        const epilog1 = ";\n\n});\n";
        if (unwrapped.startsWith(prolog1) && unwrapped.endsWith(epilog1)) {
          unwrapped = unwrapped.slice(prolog1.length, unwrapped.length - epilog1.length);
        }
        // legacy compiled script, uses 'DUST' from the env
        const prolog2 = "(function() {\n  return ";
        const epilog2 = ";\n\n}).call();\n";
        if (unwrapped.startsWith(prolog2) && unwrapped.endsWith(epilog2)) {
          unwrapped = unwrapped.slice(prolog2.length, unwrapped.length - epilog2.length);
        }
        scriptLines.push(`
  .addScript(${Js(script.type)}, ${Js(script.param)}, ${unwrapped})`);
      }
      return `DUST.resources[${Js(res.name)}] = InflateBlazeTemplate({
  name: ${Js(res.name)},
  template: \`\n${escapeTicks(res.template)}\`,
  css: \`\n${escapeTicks(res.style.css)}\`,
})${scriptLines.join('')};
`;
    }).join('\n');

  const publicationSrc = Array
    .from(application.graph.objects.values())
    .filter(x => x.record.config.type === 'record-publication')
    .map(x => x.record.config)
    .map(pub => `DUST.resources[${Js(pub.name)}] = new DustPublication(${Js(graphId)}, ${Js(pub)});`)
    .join('\n');

  const routeSrc = Array
    .from(application.record.config.routes)
    .map(route => {
      let callback = '() => {}';
      switch (route.type) {
        case 'blaze-template':
          // TODO: fix action to be an object
          callback = `function() { this.render(${Js(route.action)}); }`;
          break;
        case 'inline-script':
          // Compile the route action
          callback = unwrapJs(route.action.js)+`.call(DUST)`;
          break;
        default:
          throw new Error('weird route type '+Js(route.type));
      }
      return `router.add(${Js(route.path)}, ${callback});`;
    }).join('\n');

  const routerSrc =
`const router = new DustRouter({
  baseUrl: APP_ROOT,
  defaultLayout: ${Js(application.record.config.defaultLegacyLayoutId||null)},
});\n`+routeSrc;

  return new Response(commonTags.html`<!doctype html>
<title></title>
<link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
  const APP_ROOT = "/~/apps/by-id/${graphId}";
  __meteor_runtime_config__ = {
    DDP_DEFAULT_CONNECTION_URL: 'http://ddp',
    meteorEnv: {},
  };
</script>
<script src="/~~libs/vendor/libraries/meteor-bundle.js"></script>
<script src="/~~src/graph-worker/dust-app/runtime.js"></script>
<script>

  const appSub = Meteor.subscribe("/app-runtime", ${Js(graphId)});

  /***********************************
   ***      Mongo Collections      ***
   ***********************************/

  ${collectionSrc}

  /***********************************
   ***      DDP Publications       ***
   ***********************************/

  ${publicationSrc}

  // TODO: Server Methods

  /***********************************
   ***      Blaze Templates        ***
   ***********************************/

  ${templateSrc}

  /***********************************
   ***      Iron Router Config     ***
   ***********************************/

  ${routerSrc}

</script>
  `, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}