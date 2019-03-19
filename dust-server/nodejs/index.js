#!/usr/bin/env node
const fs = require('fs');
const process = require('process');
const pkgMeta = require('./package.json');
const manifest = require('../manifest.json');

function requirePlatform() {
  require('./shims/scope');

  // load all the platform source code
  const {scripts} = manifest.app.background;
  let shimCount = 0;
  for (const script of scripts) {

    // check for a nodejs replacement impl
    const shimPath = './shims/'+script.replace(/\//g, '.');
    let hasShim = false;
    try {
      require.resolve(shimPath);
      hasShim = true;
      shimCount++;
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err;
    }

    // load the file
    if (hasShim) {
      require(shimPath);
    } else {
      require('../'+script);
    }
  }

  console.log(`--> Loaded ${scripts.length} base platform modules, including ${shimCount} shims`);
}

function runDust(argv) {
  requirePlatform();
  return bootDaemon(argv)
    .then(() => {
      console.log(`\r==> Server entrypoint completed.`);
    }, err => {
      console.error();
      console.error(`\r!-> Server entrypoint crashed!`);
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

if (!argv._[0])
  yargs.showHelp()
