function escapeTicks(input) {
  return input.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}
const Js = JSON.stringify;

// modern compiled script, uses 'this' as DUST
const prolog1 = "(function() {\n  var DUST;\n\n  DUST = this;\n\n  return ";
const epilog1 = ";\n\n});\n";
// legacy compiled script, uses 'DUST' from the env
const prolog2 = "(function() {\n  return ";
const epilog2 = ";\n\n}).call();\n";
// some scripts that use coffeescript polyfills
const epilog3 = ";\n\n}).call();\n";

function unwrapJs(input) {
  if (input.startsWith(prolog1) && input.endsWith(epilog1)) {
    return input.slice(prolog1.length, input.length - epilog1.length).replace(/\n  /g, `\n`);
  }

  if (input.startsWith(prolog2) && input.endsWith(epilog2)) {
    return input.slice(prolog2.length, input.length - epilog2.length).replace(/\n  /g, `\n`);
  }

  if (input.endsWith(epilog3)) {
    return input.slice(0, input.length - epilog3.length) + ";\n}).call()";
  }
  if (input.endsWith(";\n")) {
    return input.slice(0, -2);
  }
  return input;
}

class ResourceCompiler {
  constructor(graph) {
    this.readyDeps = new Set;
    this.resources = Array
      .from(graph.objects.values())
      .map(x => x.record.config);
  }
  process(type, callback) {
    const readyChunks = new Array;
    const pendingChunks = new Array;
    const {readyDeps} = this;

    function completeDep(name) {
      if (readyDeps.has(name)) throw new Error(
        `dep ${Js(name)} completed twice`);
      readyDeps.add(name);

      for (const chunk of pendingChunks) {
        const {script, missingDeps, complete} = chunk;
        if (complete || !missingDeps.has(name)) continue;

        missingDeps.delete(name);
        if (missingDeps.size > 0) continue;

        chunk.complete = true;
        readyChunks.push(script);
        completeDep(chunk.name);
      }
    }

    for (const res of this.resources.filter(x => x.type === type)) {
      const {name} = res;
      const missingDeps = new Set;
      const self = {
        addDep(name) {
          if (!readyDeps.has(name))
            missingDeps.add(name);
        },
      };

      const script = `
  DUST.resources[${Js(name)}] = ${callback.call(self, res)}`;
      if (missingDeps.size > 0) {
        pendingChunks.push({name, script, missingDeps, complete: false});
      } else {
        readyChunks.push(script);
        completeDep(name);
      }
    }

    pendingChunks
      .filter(x => !x.complete)
      .forEach(x => {
        console.warn(`Resource ${Js(x.name)} never completed!`, x);
        readyChunks.push(`
  // WARN: ${Js(x.name)} depends on missing deps ${Js(Array.from(x.missingDeps))}`);
        readyChunks.push(x.script);
      });

    return readyChunks.join('');
  }
}

async function CompileDustApp(application, input) {
  const {graphId} = application.record;

  const compiler = new ResourceCompiler(application.graph);
  compiler.readyDeps.add('core:Record');
  compiler.readyDeps.add('core:Class');

  const scriptChunks = new Array('');
  function addChunk(name, code) {
    if (!code) return;
    scriptChunks.push(`
  /***********************************
   ***     ${name.padEnd(23, ' ')} ***
   ***********************************/`);
    scriptChunks.push(code);
  }

  addChunk('Mongo Collections', compiler.process('collection', function (res) {
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
      }[field.type];
      if (!bareType) {
        this.addDep(field.type);
        bareType = `DUST.get(${Js(field.type)}, "CustomRecord")`
      };
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

    this.addDep(res.base);
    return `DUST
    .get(${Js(res.base)}, "CustomRecord")
    .inherit({
      name: ${Js(res.name)},
      fields: {${fieldLines.join('')}
      },${(behaviors.length ? `
      behaviors: ${Js(behaviors)},`:'')}
    });
`;
  }));

  addChunk('DDP Publications', compiler.process('record-publication', function (pub) {
    return `new DustPublication(${Js(graphId)}, ${Js(pub)});`;
  }));

  addChunk('Server Methods', compiler.process('external-script', function (script) {
    return `DustMethod(${Js(graphId)}, ${Js(script.name)});`;
  }));

  addChunk('Blaze Templates', compiler.process('blaze-component', function (res) {
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
    return `InflateBlazeTemplate({
    name: ${Js(res.name)},
    template: \`\n${escapeTicks(res.template)}\`,
    css: \`\n${escapeTicks(res.style.css)}\`,
  })${scriptLines.join('')};
`;
  }));

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
          callback = unwrapJs(route.action.js).replace(/\n/g, `\n  `)+`.call(DUST)`;
          break;
        default:
          throw new Error('weird route type '+Js(route.type));
      }
      return `
  router.add(${Js(route.path)}, ${callback});
`;
    }).join('');

  addChunk('Application Router', `
  const router = new DustRouter({
    baseUrl: APP_ROOT,
    defaultLayout: ${Js(application.record.config.defaultLegacyLayoutId||null)},
  });\n`+routeSrc);

  return new Response(commonTags.html`<!doctype html>
<title></title>
<link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="/~/apps/by-id/${encodeURIComponent(graphId)}/">
<script>
  const APP_ROOT = "/~/apps/by-id/${encodeURIComponent(graphId)}";
  __meteor_runtime_config__ = {
    DDP_DEFAULT_CONNECTION_URL: "http://ddp",
    meteorEnv: {},
  };
</script>
<script src="/~~libs/vendor/libraries/meteor-bundle.js"></script>
<script src="/~~src/graph-worker/dust-app/runtime.js"></script>
<script>
  const appSub = Meteor.subscribe("/app-runtime", ${Js(graphId)});
`+scriptChunks.join("\n")+`\n\n</script>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}