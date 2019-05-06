let isLaunched = false;

GraphEngine.attachBehavior('graph-daemon/v1-beta1', 'Instance', {

  // runs on every bring-up, might not be the right one
  //async setup() {  },

  async boot() {
    if (isLaunched) throw new Error(
      `Tried to launch a second GraphDaemon in one JavaScript sandbox!`);

    const {Config} = this;
    console.debug('\r--> Launching Graph Daemon');

    const storeEngine = await GraphEngine.load('graph-store/v1-beta1');
    const worldStore = new RawDynamoDBStore({
    //const worldStore = new RawVolatileStore({
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

    // BRING UP WEBSERVER

    let webServer;
    if (this.Config.Command === 'serve') {
      //await LaunchRepl(this)
      this.webServerGraph = await this.graphWorld.findOrCreateGraph({
        engineKey: 'http-server/v1-beta1',
        gitHash: this.GitHash,
        fields: {
          system: 'http-server',
        },
      });
      this.webServerCtx = await this.graphWorld.getContextForGraph(this.webServerGraph)
      this.webServer = await this.webServerCtx.getTopObject();
      console.log('brought up web server', this.webServer);
    }

    // INSTALL DUST PACKAGE
    const appKey = this.Config.PackageKey;
    console.log('\r--> graph-daemon.lifecycle now setting up Dust app', appKey);

    //const {pocRepository, compileToHtml} = GraphEngine
    //  .get('dust-app/v1-beta1').extensions;

    this.dustPackageGraph = await this.dustManager
      .findOrInstallByPackageKey(this.graphWorld, appKey);
    this.dustPackageCtx = await this.graphWorld.getContextForGraph(this.dustPackageGraph)
    this.dustPackage = await this.dustPackageCtx.getTopObject();

    //await LaunchRepl({serverDb, graphWorld, instance, appKey, pocRepository, appGraph});
  },

  async run() {
    const {Config} = this;
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

      default:
        console.error(`unknown kernel command "${Config.Command}"`);
        process.exit(2);
    }
  },

  unref() {
    if (this.webServer)
      this.webServer.unref();
  },
});
