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

  'src/model/engine_loader.js',
  'src/model/engine.js',
  'src/model/engine_builder.js',
  'src/model/graph.js',
  'src/model/graph_builder.js',
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

    // TODO: when do we want to show debug info?
    if (false)
      process.exit(1);

    try {
      console.log();
      console.log('Open GraphStores:');
      for (store of BaseBackend.allOpenStores()) {
        console.log(`#${store.storeId}`, store.constructor.name, store.describe());
      }
      console.log();
      console.log('Open GraphContexts:');
      for (graphCtx of GraphContext.allOpenContexts()) {
        console.log(`#${graphCtx.ctxId}`, graphCtx.constructor.name, '- store', `#${graphCtx.storeId}`, graphCtx.countDirty());
      }
      console.log();
    } catch (err) {
      console.error();
      console.error('Failed to print post-crash debugging info too, sorry.');
      console.error(err.stack);
      console.error();
    }

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
  .command('test-http [path]',
    'launches, tests, and stops http-server',
    yargs => { yargs
      .positional('path', {
        describe: 'HTTP url to hit as a test',
        default: '/raw-dust-app/muffler/home',
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
