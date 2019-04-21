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
  constructor(store, graph) {
    this.graphStore = store;
    this.readyDeps = new Set;
    this.resources = Array.from(graph.objects.values());
    // TODO: add extra 'resources' from Dependency resources (probably before this point tho)
    this.rootNode = Array.from(graph.roots)[0];
  }
  processPrelude() {
    const rootObjId = this.rootNode.data.nodeId;
    const lines = [commonTags.codeBlock`
      const DUST = scriptHelpers; // TODO
      DUST.objects = {};
      DUST.resTree = {
        core: {
          Record: BaseRecord,
          Class: BaseClass,
          String: String,
          Number: Number,
          Object: Object,
          Date: Date,
          Boolean: Boolean,
          Blob: Blob,
        },`];

    const printObjectTree = (data, indent) => {
      const children = this.resources
        .filter(other => other.data.parentObjId === data.nodeId);
      if (children.length) {
        lines.push(`${indent}${Js(data.name)}: {nodeId: ${Js(data.nodeId)}, children: {`);
        for (const child of children) {
          printObjectTree(child.data, indent+'  ');
        }
        lines.push(`${indent}}},`);
      } else {
        lines.push(`${indent}${Js(data.name)}: ${Js(data.nodeId)},`);
      }
    };

    lines.push(`  my: {`);
    for (const res of this.resources) {
      if (res.data.parentObjId === rootObjId)
        printObjectTree(res.data, '    ');
    }
    lines.push(`  },`);

    // also include dependency name tree
    for (const obj of this.resources.filter(x => x.data.type === 'Dependency')) {
      lines.push(`  ${obj.data.name}: {`);
      const depRoot = this.graphStore.objects.get(obj.data.fields.ChildRoot);
      const depGraph = this.graphStore.graphs.get(depRoot.data.nodeId);
      // loop through all objects belonging to the dep
      const depResources = Array.from(depGraph.objects.values());
      for (const res of depResources) {
        // prepend to compiled program
        this.resources.unshift(res);
        // print out name map
        if (res.data.parentObjId === depRoot.data.nodeId)
          printObjectTree(res.data, '    ');
      }
      lines.push(`  },`);
    }

    lines.push(`};`);
    return lines.map(x => '  '+x.replace(/\n/g, '\n  ')).join('\n');
  }
  process(type, callback) {
    const readyChunks = new Array;
    const pendingChunks = new Array;
    const {readyDeps} = this;

    function completeDep(nodeId) {
      if (readyDeps.has(nodeId)) throw new Error(
        `dep ${Js(nodeId)} completed twice`);
      readyDeps.add(nodeId);

      for (const chunk of pendingChunks) {
        const {script, missingDeps, complete} = chunk;
        if (complete || !missingDeps.has(nodeId)) continue;

        missingDeps.delete(nodeId);
        if (missingDeps.size > 0) continue;

        chunk.complete = true;
        readyChunks.push(script);
        completeDep(chunk.nodeId);
      }
    }

    for (const obj of this.resources.filter(x => x.data.type === type)) {
      const {name, nodeId} = obj.data;
      const missingDeps = new Set;
      const self = {
        addDep(nodeId) {
          if (!readyDeps.has(nodeId))
            missingDeps.add(nodeId);
        },
      };

      const script = `
  DUST.objects[${Js(nodeId)}] =
  ${callback.call(self, obj.data)}`;
      if (missingDeps.size > 0) {
        pendingChunks.push({nodeId, script, missingDeps, complete: false});
      } else {
        readyChunks.push(script);
        completeDep(nodeId);
      }
    }

    pendingChunks
      .filter(x => !x.complete)
      .forEach(x => {
        console.warn(`Resource ${Js(x.name)} never completed!`, x);
        readyChunks.push(`
  // WARN: ${Js(x.name)} depends on missing objects ${Js(Array.from(x.missingDeps))}`);
        readyChunks.push(x.script);
      });

    return readyChunks.join('');
  }
}

GraphEngine.extend('dust-app/v1-beta1').compileToHtml =
async function CompileDustApp(store, graph, {appRoot, usesLegacyDB}) {
  const {nodeId} = graph.data;
  const application = Array.from(graph.roots)[0];
  if (!application) throw new Error(`app-missing:
    Graph '${nodeId}' does not contain a web application.`);

  const compiler = new ResourceCompiler(store, graph);

  const scriptChunks = new Array('');
  function addChunk(name, code) {
    if (!code) return;
    scriptChunks.push(`
  /***********************************
   ***     ${name.padEnd(23, ' ')} ***
   ***********************************/`);
    scriptChunks.push(code);
  }

  addChunk('Application Prelude', compiler.processPrelude());

  addChunk('Mongo Collections', compiler.process('RecordSchema', function (res) {
    const {Fields, Base, SlugBehavior, TimestampBehavior} = res.fields;

    let bareBase;
    if (Base.BuiltIn) {
      bareBase = commonTags.source`
        DUST.get(${Js('core:' + Base.BuiltIn)}, "CustomRecord")`;
    } else if (Base.SchemaRef) {
      bareBase = commonTags.source`
        DUST.objects[${Js(Base.SchemaRef)}]`;
      this.addDep(Base.SchemaRef);
    }

    const fieldLines = [];
    for (const field of Fields) {
      const {Key, Type, Optional, IsList, Immutable, DefaultValue} = field;
      let bareType;
      if (Type.BuiltIn) {
        bareType = `DUST.get(${Js('core:'+Type.BuiltIn)}, "CustomRecord")`
      } else if (Type.SchemaRef) {
        this.addDep(Type.SchemaRef);
        bareType = `DUST.objects[${Js(Type.SchemaRef)}]`;
      } else if (Type.SchemaEmbed) {
        throw new Error(`TODO: SchemaEmbed`);
      }
      if (IsList) bareType = `[${bareType}]`;

      const bits = [`type: ${bareType}`];
      if (Optional) bits.push(`optional: true`);
      if (Immutable) bits.push(`immutable: true`);
      if (DefaultValue) {
        bits.push(`default: function() { return ${Js(JSON.parse(DefaultValue))}; }`);
      }
      fieldLines.push(`
        ${Key}: { ${bits.join(', ')} },`);
    }

    const behaviors = {};
    if (SlugBehavior)
      behaviors.slug = {
        fieldName: SlugBehavior.Field,
      };
    if (TimestampBehavior)
      behaviors.timestamp = {};

    return `${bareBase}
    .inherit({
      name: ${Js(res.name)},
      fields: {${fieldLines.join('')}
      },${(Object.keys(behaviors).length ? `
      behaviors: ${Js(behaviors, null, 2).replace(/\n/g, `\n      `)},`:'')}
    });\n`;
  }));

  addChunk('DDP Publications', compiler.process('Publication', function (res) {
    return `new DustPublication(${Js(nodeId)}, ${Js(res.name)}, ${Js(res.fields)});`;
  }));

  addChunk('Server Methods', compiler.process('ServerMethod', function (res) {
    return `DustMethod(${Js(nodeId)}, ${Js(res.name)});`;
  }));

  addChunk('Blaze Templates', compiler.process('Template', function (res) {
    const {Handlebars, Scripts, Style} = res.fields;

    const scriptLines = [];
    for (const {Coffee, JS, Refs, Type} of Scripts) {
      const type = Object.keys(Type)[0];
      const param = Type[type];
      scriptLines.push(`
  .addScript(${Js(type)}, ${Js(param)}, ${unwrapJs(JS)})`);
    }
    return `InflateBlazeTemplate({
    name: ${Js(res.name)},
    nodeId: ${Js(res.nodeId)},
    template: \`\n${escapeTicks(Handlebars)}\`,
    css: \`\n${escapeTicks(Style.CSS)}\`,
  })${scriptLines.join('')};
`;
  }));

  addChunk('Application Router', compiler.process('AppRouter', function (res) {
    const {DefaultLayout, IconUrl} = res.fields;
    const lines = [commonTags.source`
      new DustRouter({
          baseUrl: APP_ROOT,
          iconUrl: ${Js(IconUrl || null)},
    `];

    if (DefaultLayout) {
      this.addDep(DefaultLayout);
      lines.push(`    defaultLayout: DUST.objects[${Js(DefaultLayout)}],`);
    }

    lines.push(`  });\n`);
    return lines.join('\n');
  }));

  addChunk('App Routes', compiler.process('Route', function (res) {
    const {Path, Action} = res.fields;
    let callback = '() => {}';
    switch (true) {

      case 'Render' in Action:
        const {Template} = Action.Render;
        this.addDep(Template);
        callback = `function() { this.render(DUST.objects[${Js(Template)}]); }`;
        break;

      case 'Script' in Action:
        const {JS} = Action.Script;
        // Compile the route action
        callback = unwrapJs(JS).replace(/\n/g, `\n  `)+`.call(DUST)`;
        break;
      default:
        throw new Error('weird route type '+Js(route.type));
    }
    return `DUST.objects[${Js(res.parentObjId)}]
    .add(${Js(Path)}, ${callback});\n`;
  }));

  addChunk('Default Subscription', commonTags.source`
    if (DUST.resTree.my.Default) {
      const defaultPub = DUST.objects[DUST.resTree.my.Default];
      const defaultSub = defaultPub.subscribe();
    }
  `);

  return new Response(commonTags.html`<!doctype html>
<title></title>
<link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href=${Js(appRoot+'/')}>
<script>
  const APP_ROOT = ${Js(appRoot)};
  __meteor_runtime_config__ = {
    DDP_DEFAULT_CONNECTION_URL: "http://ddp",
    meteorEnv: {},
  };
</script>
<style type="text/css">
  html, body {
    height: 100%;
    margin: 0;
  }

  body {
    display: flex;
    flex-direction: column;
  }
</style>
<script src="/~~libs/vendor/libraries/meteor-bundle.js"></script>
<script src="/~~src/model/impl/dust-app/runtime.js"></script>
${usesLegacyDB ? `<script src="/~~src/model/impl/dust-app/runtime-build.js"></script>` : ''}
<script>
  const appSub = Meteor.subscribe("/app-runtime", {
    nodeId: ${Js(nodeId)},
    appPath: APP_ROOT,
  });
  ${usesLegacyDB ? `const buildSub = Meteor.subscribe("/legacy-dust-app-data");` : ''}
`+scriptChunks.join("\n")+`\n\n</script>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
};
