launchDaemon = async function launchDaemon(argv) {
  let kernel;

  console.debug('Starting server boot');
  try {

    kernel = new Kernel(argv);
    await kernel.ready;

  } finally {
    console.groupEnd();
    console.groupEnd();
  }
  console.log('==> Completed kernel boot :)');
  console.log();

  await kernel.boot(); // returns within 30s
  await kernel.run(); // may never return

  console.log();
  console.log(`==> Daemon function returned.`);
  kernel.unref();

  if (argv.repl) {
    return runRepl({kernel});
  }

  // indent any shutdown operations
  console.group();
  console.group();

  // TODO: stop the kernel after a timeout
}

ToastNotif = function ToastNotif(text) {
  console.error(`\r--> SRV NOTIF: ${text}`);
}

async function runRepl(context) {
  const {promisify, inspect} = require('util');
  const asyncTimeout = promisify(setTimeout);
  const repl = require('repl');
  const vm = require('vm');
  const process = require('process');

  // get DEP0079 out of the way early
  inspect({inspect(){return false}});

  await asyncTimeout(10);
  console.log();

  const replServer = repl.start({
    prompt: `DUST> `,
  });
  replServer.context = vm.createContext(context);

  const exitCode = await
  new Promise(resolve => {
    process.once('SIGINT', evt => resolve(12));
    replServer.defineCommand('q', () => resolve(0));
  });

  console.error(`Quitting due to outside input. Status`, exitCode);
  replServer.close();
  // TODO: await other shutdown
  process.exit(exitCode);
}
