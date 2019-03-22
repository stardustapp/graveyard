const {promisify} = require('util');
const asyncTimeout = promisify(setTimeout);

Kernel = class Kernel {
  constructor(argv) {
    this.argv = argv;
    this.systemEnv = new Environment();
    this.ready = this.init();
  }

  async init() {

    if (this.argv.dataPath) {
      this.baseDb = await RootServerDatabase.openPersisted(this.argv.dataPath);
    } else {
      this.baseDb = await RootServerDatabase.openTemporary();
    }
    console.debug('Opened system database');

    if (this.argv.command === 'serve') {
      // init the web server to serve up skylink (and more)
      this.webServer = new HttpServer(this.TODO, async function (hostname) {
        /*
        const domain = await kernel.domainManager.findDomain(hostname);
        if (!domain) throw new Error('Domain does not exist');
        console.debug('loading host', hostname, domain);
        */
        return new VirtualHost(hostname, null);
      });

      // expose the entire system environment on the network
      ExposeSkylinkOverHttp(this.systemEnv, this.webServer);
      await this.webServer.startServer(this.argv);
    }

    console.debug('TODO: construct the local resource graph');

    this.graphStore = new GraphStore(this.baseDb.sub('sys'));
    await this.graphStore.ready;

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
