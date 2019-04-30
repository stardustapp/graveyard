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
    return input.slice(prolog1.length, input.length - epilog1.length);//.replace(/\n  /g, `\n`);
  }

  if (input.startsWith(prolog2) && input.endsWith(epilog2)) {
    return input.slice(prolog2.length, input.length - epilog2.length);//.replace(/\n  /g, `\n`);
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
  constructor(dustManager, appGraph, appPackage) {
    this.dustManager = dustManager;
    this.readyDeps = new Set;
    this.resources = new Array;
    // TODO: add extra 'resources' from Dependency resources (probably before this point tho)
    this.appGraph = appGraph;
    this.appPackage = appPackage;
  }
  async processPrelude() {
    const rootObjId = this.appPackage.nodeId;
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

    const printObjectTree = async (resNode, indent) => {
      let children = [];
      let resName = resNode.Name;
      switch (resNode.nodeType) {
        case 'AppRouter':
          children = await resNode.REFERENCES.fetchRouteList();
          break;
        case 'Route':
          resName = resNode.nodeId;
      }

      if (children.length) {
        lines.push(`${indent}${Js(resName)}: {nodeId: ${Js(resNode.nodeId)}, children: {`);
        for (const child of children) {
          this.resources.push(child);
          await printObjectTree(child, indent+'  ');
        }
        lines.push(`${indent}}},`);
      } else {
        lines.push(`${indent}${Js(resName)}: ${Js(resNode.nodeId)},`);
      }
    };

    lines.push(`  my: {`);
    for (const res of await this.appPackage.HAS_NAME.fetchAllObjects()) {
      this.resources.push(res);
      await printObjectTree(res, '    ');
    }
    lines.push(`  },`);

    // also include dependency name tree
    for (const depObj of await this.appPackage.HAS_NAME.fetchDependencyList()) {
      lines.push(`  ${depObj.Name}: {`);
      console.log('loading up dependency', depObj.PackageKey);
      const graphWorld = await this.appGraph.getGraphCtx().getNodeById('top');
      const depGraph = await this.dustManager.findByPackageKey(
        graphWorld, depObj.PackageKey);
      const depCtx = await graphWorld.getContextForGraph(depGraph);
      console.log('dep', depObj.PackageKey, 'loaded as', depGraph, depCtx);
      const childPackage = depObj.ChildRoot;

      //console.log('dep', depObj, 'led to child package', childPackage);
      console.log('dep led to child package', depObj);
      throw new Error(`compile DUST Dependency TODO`);
      //const depRoot = await this.dustManager.objects.get(obj.data.fields.ChildRoot);
      //const depGraph = await this.dustManager.graphs.get(depRoot.data.nodeId);
      // loop through all objects belonging to the dep
      //const depResources = Array.from(depGraph.objects.values());
      for (const res of depResources) {
        // prepend to compiled program
        this.resources.unshift(res);
        // print out name map
        printObjectTree(res, '    ');
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

    for (const obj of this.resources.filter(x => x.nodeType === type)) {
      const {nodeId} = obj;
      const missingDeps = new Set;
      const self = {
        addDep(nodeId) {
          if (!readyDeps.has(nodeId))
            missingDeps.add(nodeId);
        },
      };

      const script = `
  DUST.objects[${Js(nodeId)}] =
  ${callback.call(self, obj)}`;
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
        console.warn(`Resource ${Js(x.Name)} never completed!`, x);
        readyChunks.push(`
  // WARN: ${Js(x.Name)} depends on missing objects ${Js(Array.from(x.missingDeps).map(x=>x.nodeId))}`);
        readyChunks.push(x.script);
      });

    return readyChunks.join('');
  }
}

GraphEngine.extend('dust-app/v1-beta1').compileToHtml =
async function CompileDustApp(dustManager, appGraph, appPackage, {appRoot, usesLegacyDB}) {
  const {nodeId} = appGraph;
  if (appPackage.PackageType !== 'App') throw new Error(`app-missing:
    Graph '${nodeId}' does not contain a web application.`);

  const compiler = new ResourceCompiler(dustManager, appGraph, appPackage);

  const scriptChunks = new Array('');
  function addChunk(name, code) {
    if (!code) return;
    scriptChunks.push(`
  /***********************************
   ***     ${name.padEnd(23, ' ')} ***
   ***********************************/`);
    scriptChunks.push(code);
  }

  addChunk('Application Prelude', await compiler.processPrelude());

  addChunk('Mongo Collections', compiler.process('RecordSchema', function (res) {
    const {Fields, Base, SlugBehavior, TimestampBehavior} = res;

    let bareBase;
    if (Base.BuiltIn) {
      bareBase = commonTags.source`
        DUST.get(${Js('core:' + Base.BuiltIn)}, "CustomRecord")`;
    } else if (Base.SchemaRef) {
      bareBase = commonTags.source`
        DUST.objects[${Js(Base.SchemaRef.nodeId)}]`;
      this.addDep(Base.SchemaRef.nodeId);
    }

    const fieldLines = [];
    for (const field of Fields) {
      const {Key, Type, Optional, IsList, Immutable, DefaultValue} = field;
      let bareType;
      if (Type.BuiltIn) {
        bareType = `DUST.get(${Js('core:'+Type.BuiltIn)}, "CustomRecord")`
      } else if (Type.SchemaRef) {
        this.addDep(Type.SchemaRef.nodeId);
        bareType = `DUST.objects[${Js(Type.SchemaRef.nodeId)}]`;
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
      name: ${Js(res.Name)},
      fields: {${fieldLines.join('')}
      },${(Object.keys(behaviors).length ? `
      behaviors: ${Js(behaviors, null, 2).replace(/\n/g, `\n      `)},`:'')}
    });\n`;
  }));

  addChunk('DDP Publications', compiler.process('Publication', function (res) {
    return `new DustPublication(${Js(nodeId)}, ${Js(res.Name)}, ${Js(res.Fields)});`;
  }));

  addChunk('Server Methods', compiler.process('ServerMethod', function (res) {
    return `DustMethod(${Js(nodeId)}, ${Js(res.Name)});`;
  }));

  addChunk('Blaze Templates', compiler.process('Template', function (res) {
    const {Handlebars, Scripts, Style} = res;

    const scriptLines = [];
    for (const {Coffee, JS, Refs, Type} of Scripts) {
      const type = Type.currentKey;
      const param = Type[type];
      scriptLines.push(`
  .addScript(${Js(type)}, ${Js(param)}, ${unwrapJs(JS)})`);
    }
    return `InflateBlazeTemplate({
    name: ${Js(res.Name)},
    nodeId: ${Js(res.nodeId)},
    template: \`\n${escapeTicks(Handlebars)}\`,
    css: \`\n${escapeTicks(Style.CSS)}\`,
  })${scriptLines.join('')};
`;
  }));

  addChunk('App Routes', compiler.process('Route', function (res) {
    const {Path, Action} = res;
    let callback = '() => {}';
    switch (true) {

      case 'Render' in Action:
        const {Template} = Action.Render;
        this.addDep(Template.nodeId);
        callback = `function() { this.render(DUST.objects[${Js(Template.nodeId)}]); }`;
        break;

      case 'Script' in Action:
        const {JS} = Action.Script;
        // Compile the route action
        callback = unwrapJs(JS).replace(/\n/g, `\n  `)+`.call(DUST)`;
        break;
      default:
        throw new Error('weird route type '+Js(route.type));
    }
    return commonTags.source`
      new DustRouteHandler(${Js(Path)}, ${callback});
    `;
  }));

  addChunk('Application Router', compiler.process('AppRouter', function (res) {
    const {DefaultLayout, IconUrl, RouteTable} = res;
    const lines = [commonTags.source`
      new DustRouter({
          baseUrl: APP_ROOT,
          iconUrl: ${Js(IconUrl || null)},
    `];

    if (DefaultLayout) {
      this.addDep(DefaultLayout.nodeId);
      lines.push(`    defaultLayout: DUST.objects[${Js(DefaultLayout.nodeId)}],`);
    }
    lines.push(`    routeTable: [`);
    for (const route of RouteTable) {
      this.addDep(route.nodeId);
      lines.push(`      DUST.objects[${Js(route.nodeId)}], // ${Js(route.Path)}`);
    }
    lines.push(`    ],`);

    lines.push(`  });\n`);
    return lines.join('\n');
  }));

  addChunk('Default Subscription', commonTags.source`
    if (DUST.resTree.my.Default) {
      const defaultPub = DUST.objects[DUST.resTree.my.Default];
      const defaultSub = defaultPub.subscribe();
    }
  `);

  return commonTags.html`<!doctype html>
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
`+scriptChunks.join("\n")+`\n\n</script>`;
};
