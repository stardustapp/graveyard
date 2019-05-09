const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0)
    console.warn('WARN: exec() stderr:', stderr);
  return stdout.trim();
}

let isLaunched = false;

GraphEngine.attachBehavior('graph-daemon/v1-beta1', 'Instance', {

  // runs on every bring-up, might not be the right one
  //async setup() {  },

  async boot() {
    if (isLaunched) throw new Error(
      `Tried to launch a second GraphDaemon in one JavaScript sandbox!`);

    const {Config} = this;
    console.debug('\r--> Launching Graph Daemon');

    // BRING UP PERSISTENT DATA
    const storeEngine = await GraphEngine.load('graph-store/v1-beta1');
    //const worldStore = new RawDynamoDBStore({
    const worldStore = new RawVolatileStore({
      engineKey: 'graph-store/v1-beta1',
      tablePrefix: 'DustGraph',
    });
    await worldStore.ready;
    this.graphWorld = await storeEngine.buildFromStore({}, worldStore);

    // GET DUST MANAGER
    this.dustManagerGraph = await this.graphWorld.findOrCreateGraph({
      engineKey: 'dust-manager/v1-beta1',
      gitHash: this.GitHash,
      fields: {
        system: 'dust-manager',
      },
    });
    this.dustManagerCtx = await this.graphWorld.getContextForGraph(this.dustManagerGraph)
    this.dustManager = await this.dustManagerCtx.getTopObject();

    if (this.Config.Command === 'run') {
      // INSTALL DUST PACKAGE
      const appKey = this.Config.PackageKey;
      console.log('\r--> graph-daemon.lifecycle now setting up Dust app', appKey);
      this.dustPackageGraph = await this.dustManager
        .findOrInstallByPackageKey(this.graphWorld, appKey);
      this.dustPackageCtx = await this.graphWorld.getContextForGraph(this.dustPackageGraph)
      this.dustPackage = await this.dustPackageCtx.getTopObject();
    }

    // BRING UP WEBSERVER
    let webServer;
    if (this.Config.Command === 'serve' || this.Config.Command === 'test-http') {
      this.webServerGraph = await this.graphWorld.findOrCreateGraph({
        engineKey: 'http-server/v1-beta1',
        gitHash: this.GitHash,
        fields: {
          system: 'http-server',
        },
      });
      this.webServerCtx = await this.graphWorld.getContextForGraph(this.webServerGraph)
      this.webServer = await this.webServerCtx.getTopObject();
      await this.webServer.activate();
      console.log('brought up web server', this.webServer);

      await this.webServer.DefaultHandler;
      await this.webServer.DefaultHandler.InnerRules[0].ForwardTo; // 'localhost'
      this.webServer.DefaultHandler.InnerRules[0].ForwardTo.InnerRules.push({
        Conditions: [{
          PathPatterns: ['/dust-app/*'],
        }],
        ForwardTo: {
          DefaultAction: {
            Reference: this.dustManager,
          },
        },
      });
    }
  },

  async run() {
    const {LaunchFlags, Config} = this;
    switch (Config.Command) {

      case 'run':
        console.log('using dust pkg', this.dustPackage)
        const serverMethod = await this.dustPackage
          .HAS_NAME.findServerMethod({
            Name: Config.MethodName,
          });
        console.log('Running server method', serverMethod.Name, serverMethod.Source);
        await serverMethod.invoke({username: 'dan'});
        break;

      case 'serve':
        console.log('daemon waiting for work.');
        await new Promise(resolve => {
          process.once('SIGINT', resolve);
        });
        throw new Error(`Dust server was interrupted.`);

      case 'test-http':
        console.log('sending test request...');
        const stdout = await execForLine(`curl -s http://localhost:9238${LaunchFlags.path}`);
        console.log();
        console.log('>', stdout.split('\n').join('\n> '));
        break;

      default:
        console.error(`unknown kernel command "${Config.Command}"`, LaunchFlags);
        process.exit(2);
    }
  },

  unref() {
    if (this.webServer)
      this.webServer.unrefAll();
  },
});
