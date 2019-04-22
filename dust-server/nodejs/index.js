#!/usr/bin/env node
const fs = require('fs');
const process = require('process');
const pkgMeta = require('./package.json');
const manifest = require('../manifest.json');

// Map well-behaved modules to desired global variables
const importRules = {
  // direct export
  'vendor/libraries/bugsnag.js': 'bugsnag',
  'vendor/libraries/moment.js': 'moment',
  'vendor/libraries/base64.js': 'base64js',
  'vendor/libraries/common-tags.js': 'commonTags',
  'src/webapp/core/skylink/client.js': 'Skylink',

  // multiple named exports
  'src/core/api-entries.js': true,
  'src/core/enumeration.js': true,
  'src/lib/caching.js': true,
  'src/lib/locking.js': true,
  'src/lib/path-fragment.js': true,
  'src/daemon/background.js': true,
  'src/daemon/database.js': true,

  'src/model/runtime.js': true,
  'src/model/node-proxy.js': true,
};

// Include things like the graph engine from the service worker
const extraImports = [
  'vendor/libraries/common-tags.js',

  'src/lib/locking.js',

  'src/model/engine.js',
  'src/model/engine_builder.js',
  'src/model/graph.js',
  'src/model/graph_builder.js',
  'src/model/transaction.js',
  'src/model/record-filter.js',

  'src/model/backends/_base.js',
  'src/model/backends/level.js',
  'src/model/backends/volatile.js',
  'src/model/backends/dynamodb.js',

  'src/model/types/_base.js',
  'src/model/types/Node.js',
  'src/model/types/Edge.js',
  'src/model/types/Relation.js',
  'src/model/types/Primitive.js',
  'src/model/types/Unstructured.js',
  'src/model/types/Struct.js',
  'src/model/types/Optional.js',
  'src/model/types/Reference.js',
  'src/model/types/AnyOfKeyed.js',
  'src/model/types/List.js',

  //'src/model/accessors.js',
  //'src/model/node-proxy.js',
  //'src/model/runtime.js',
  'src/model/context.js',

  'src/engines/graph-daemon/model.js',
  'src/engines/graph-daemon/lifecycle.js',
  'src/engines/graph-daemon/behaviors/Instance.js',

  'src/engines/graph-store/model.js',
  'src/engines/graph-store/lifecycle.js',
  'src/engines/graph-store/behaviors/World.js',
  'src/engines/graph-store/behaviors/Engine.js',
  'src/engines/graph-store/behaviors/Graph.js',

  'src/engines/dust-manager/model.js',
  'src/engines/dust-manager/lifecycle.js',
  'src/engines/dust-manager/behaviors/Manager.js',
  'src/engines/dust-manager/behaviors/Repository.js',

  'src/engines/dust-app/model.js',
  'src/engines/dust-app/ddp-api.js',
  'src/engines/dust-app/json-codec.js',
  'src/engines/dust-app/lifecycle.js',
  'src/engines/dust-app/repository.js',
  'src/engines/dust-app/compile.js',
  'src/engines/dust-app/behaviors/Package.js',
  'src/engines/dust-app/behaviors/AppRouter.js',
  'src/engines/dust-app/behaviors/Route.js',
  'src/engines/dust-app/behaviors/Template.js',
  'src/engines/dust-app/behaviors/RecordSchema.js',
  'src/engines/dust-app/behaviors/Dependency.js',
  'src/engines/dust-app/behaviors/Publication.js',
  'src/engines/dust-app/behaviors/ServerMethod.js',
];

let shimCount = 0;
function importPlatformModule(path, importRule=false) {
  // check for a nodejs-targetted wholesale replacement
  const shimPath = './shims/'+path.replace(/\//g, '.');
  let hasShim = false;
  try {
    require.resolve(shimPath);
    hasShim = true;
    shimCount++;
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }

  // bring in the code
  let module;
  if (hasShim) {
    // shims completely replace the module
    module = require(shimPath);
  } else {
    module = require('../'+path);
  }

  // rules support post-processing the module
  switch (importRule !== null && importRule.constructor) {
    case String:
      global[importRule] = module;
      break;
    case Boolean:
      if (importRule) {
        for (const key in module) {
          global[key] = module[key];
        }
      }
      break;
    default:
      throw new Error(`Unknown platform importRule "${importRule}"`);
  }
}

function importPlatform() {
  console.group('==> Awakening Daemon...');
  console.group();

  require('./shims/scope');

  // load the chrome's platform source
  const {scripts} = manifest.app.background;
  for (const script of scripts) {
    importPlatformModule(script, importRules[script]);
  }

  // add extra platform files
  for (const script of extraImports) {
    importPlatformModule(script, true);
  }

  console.log(`\r--> Loaded ${scripts.length} platform modules and ${extraImports.length} extras, including ${shimCount} shimmed modules`);
}

function runDust(argv) {
  argv.command = argv._.shift();

  (async function (opts) {
    importPlatform();
    await launchDaemon(opts);
  })(argv).catch(err => {
    console.groupEnd();
    console.groupEnd();
    console.error();
    console.error(`!-> Daemon crashed unexpectedly!`);
    console.error(err.stack);
    process.exit(1);
  });
}

// bring it up
const yargs = require('yargs');
const argv = yargs
  .usage('Usage: $0 <command> [options]')
  .option('data-path', {
    describe: 'Persist server memory at this path',
    type: 'string',
  })
  .option('port', {
    describe: 'Serve HTTP on this TCP port',
    type: 'number',
    default: 9237,
  })
  .option('repl', {
    describe: 'Set up a REPL once the daemon is idle',
    type: 'boolean',
    default: false,
  })
  .command('serve [package]',
    'launch a package as a service',
    yargs => { yargs
      .positional('package', {
        describe: 'ID for a package containing the desired Service',
        default: 'profile-server',
      })
    }, runDust)
  .command('run <package> <method> [args...]',
    `execute a server method`,
    yargs => { yargs
      .positional('package', {
        describe: 'ID for a package containing the desired Method',
      })
      .positional('method', {
        describe: 'server method to call within the package',
      })
    }, runDust)
  .version()
  .strict()
  .argv;

if (!argv.command)
  yargs.showHelp()
