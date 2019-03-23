const {promisify} = require('util');
const asyncTimeout = promisify(setTimeout);

Kernel = class Kernel {
  constructor(argv) {
    this.argv = argv;
    this.systemEnv = new Environment();
    this.ready = this.init(argv);
  }

  async init(argv) {
    const {lifecycle} = GraphEngine.get('nodejs-server/v1-beta1').extensions;

    self.DUST = this.server =
    await lifecycle.createServer({
      DataPath: argv.dataPath,
      Command: argv.command,
      PackageKey: argv.package,
      MethodName: argv.method,
      HttpPort: argv.port,
      HttpHost: argv.host,
    });

    console.debug('Created server.');

    //this.graphStore = new GraphStore(this.baseDb.sub('daemon'));
    //await this.graphStore.ready;

    console.debug('Kernel initialized');
    return this;
  }

  // expected to return within 30 seconds
  async boot() {
    /*
    const appKey = this.argv.package;
    const {pocRepository, compileToHtml} = GraphEngine
      .get('dust-app/v1-beta1').extensions;

    const appGraph = await this.graphStore.findGraph({
      engineKey: 'app-profile/v1-beta1',
      fields: { appKey },
    });
    if (!appGraph) {
      appGraph = await pocRepository.installWithDeps(this.graphStore, appKey);
    }
    if (!appGraph) throw new Error(
      `App installation ${JSON.stringify(appKey)} not found`);

    const appInst = Array.from(appGraph.roots)[0];
    */
    console.debug('TODO: install package:', this.argv.package);
  }

  // should run for the lifetime of the runtime
  // return to EXIT
  async run() {
    switch (this.argv.command) {

      case 'run':
        console.log('TODO: run package method', this.argv.method);
        break;

      case 'serve':
        console.log('daemon waiting for work.');
        await new Promise(resolve => {
          process.once('SIGINT', resolve);
        });
        throw new Error(`Dust server was interrupted.`);

      default:
        console.error(`unknown kernel command "${this.argv.command}"`);
        process.exit(2);
    }
  }

  unref() {
    if (this.webServer)
      this.webServer.unref();
  }
}
