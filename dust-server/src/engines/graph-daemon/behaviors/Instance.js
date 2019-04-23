let isLaunched = false;

GraphEngine.attachBehavior('graph-daemon/v1-beta1', 'Instance', {

  // runs on every bring-up, might not be the right one
  //async setup() {  },

  async boot() {
    if (isLaunched) throw new Error(
      `Tried to launch a second GraphDaemon in one JavaScript sandbox!`);

    const {Config} = this;
    console.debug('\r--> Launching Graph Daemon');

    const storeEngine = GraphEngine.get('graph-store/v1-beta1');
    const worldStore = new RawDynamoDBStore({
    //const worldStore = new RawVolatileStore({
      engineKey: 'graph-store/v1-beta1',
      tablePrefix: 'DustGraph',
    });
    await worldStore.ready;

    this.graphWorld = await storeEngine.buildFromStore({}, worldStore);

    // GET DUST MANAGER

    this.dustManager = await this.graphWorld.findOrCreateGraph({
      engineKey: 'dust-manager/v1-beta1',
      gitHash: this.GitHash,
      fields: {
        system: true,
      },
    });

    // BRING UP WEBSERVER

    let webServer;
    if (this.Config.Command === 'serve') {
      webServer = new HttpServer(this.TODO, hostname => new VirtualHost(hostname, null));
      //ExposeSkylinkOverHttp(this.systemEnv, webServer);
      await webServer.startServer({
        host: this.Config.HttpHost,
        port: this.Config.HttpPort || 9237,
      });
    }

    // INSTALL DUST PACKAGE
    const appKey = this.Config.PackageKey;
    console.log('\r--> graph-daemon.lifecycle now setting up Dust app', appKey);

    //const {pocRepository, compileToHtml} = GraphEngine
    //  .get('dust-app/v1-beta1').extensions;

    this.dustPackage = await this.dustManager
      .findOrInstallByPackageKey(this.graphWorld, appKey);

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
