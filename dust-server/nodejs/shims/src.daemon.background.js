const ini = require('ini');
const fs = require('fs');
const path = require('path');

class IniLoader {
  constructor(fsPath, extension='.ini') {
    this.fsPath = fsPath;
    this.extension = extension;
  }
  listComponents() {
    return fs
      .readdirSync(this.fsPath)
      .filter(x => x.endsWith(this.extension))
      .map(x => x.slice(0, x.length - this.extension.length));
  }
  readComponent(key) {
    const filePath = path.join(this.fsPath, key+this.extension);
    return ini.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

const RootFolder = 'config';
function registerComponentFolder(folderName, type, registerFunc) {
  const loader = new IniLoader(path.join(RootFolder, folderName));
  return Promise.all(loader
    .listComponents()
    .map(key => registerFunc.invoke(new FolderLiteral('input', [
      new StringLiteral('type', type),
      new StringLiteral('key', key),
      new StringLiteral('load source', 'host-filesystem'),
      new StringLiteral('data', JSON.stringify(loader.readComponent(key))),
    ]))));
}

launchDaemon = async function launchDaemon(argv) {
  let kernel;

  console.debug('Starting server boot');
  try {

    kernel = new Kernel(argv);
    await kernel.ready;

    const registerFunc = await kernel.env.getEntry('/Components/Register/invoke');
    await registerComponentFolder('connections', 'Connection', registerFunc);
    await registerComponentFolder('daemons', 'Daemon', registerFunc);
    await registerComponentFolder('services', 'Service', registerFunc);

  } finally {
    console.groupEnd();
    console.groupEnd();
  }
  console.log('==> Completed kernel boot :)');
  console.log();

  try {
    await kernel.boot(); // returns within 30s
    await kernel.run(); // may never return
  } finally {
    console.log('flushing datadog')
    await Datadog.Instance.flushNow();
  }

  console.log();
  console.log(`==> Daemon function returned.`);
  kernel.unref();

  if (argv.repl) {
    const exitCode = await LaunchRepl({kernel});
    if (exitCode) process.exit(exitCode);
    return;
  }

  // indent any shutdown operations
  console.group();
  console.group();

  // TODO: stop the kernel after a timeout
}

ToastNotif = function ToastNotif(text) {
  console.error(`\r--> SRV NOTIF: ${text}`);
}

async function LaunchRepl(context) {
  const {promisify, inspect} = require('util');
  const asyncTimeout = promisify(setTimeout);
  const repl = require('repl');
  const vm = require('vm');
  const process = require('process');

  // get DEP0079 out of the way early
  inspect({inspect(){return false}});

  await asyncTimeout(10);
  console.log();

  console.log('In scope:', Object.keys(context).join(', '));
  context.console = console;
  const replServer = repl.start({
    prompt: `DUST> `,
    replMode: repl.REPL_MODE_STRICT,
  });
  replServer.context = vm.createContext(context);

  const exitCode = await
  new Promise(resolve => {
    process.once('SIGINT', evt => resolve(12));
    replServer.defineCommand('q', () => resolve(0));
  });

  console.error(`Quitting REPL. Status`, exitCode);
  replServer.close();
  return exitCode;
}

if (typeof module !== 'undefined') {
  module.exports = {
    LaunchRepl,
  };
}
