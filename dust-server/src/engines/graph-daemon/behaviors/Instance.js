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

    this.dustManagerGraph = await this.graphWorld.findOrCreateGraph({
      engineKey: 'dust-manager/v1-beta1',
      gitHash: this.GitHash,
      fields: {
        system: true,
      },
    });
    this.dustManagerCtx = await this.graphWorld.getContextForGraph(this.dustManagerGraph)
    this.dustManager = await this.dustManagerCtx.getTopObject();

    // BRING UP WEBSERVER

    const mainVHost = {
      handleGET: async (meta, responder) => {
        const {method, uri, headers, queryParams, ip} = meta;
        const parts = uri.slice(1).split('/');
        if (parts[0] === 'dust-app' && parts[1]) {
          return responder.sendJson({hello: 'world'});
        }
        if (parts[0] === 'raw-dust-app' && parts[1]) {
          if (parts[2] === '~~ddp') {
            return responder.sendJson({todo: true});
          }
          return await this.dustManager.serveAppPage(this.graphWorld, parts[1], meta, responder);
        }
        if (parts[0] === '~~src' && parts.slice(-1)[0].endsWith('.js')) {
          const filePath = ['src', ...parts.slice(1)].join('/');
          console.log('streaming JS source file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'application/javascript');
        }
        if (parts[0] === '~~vendor' && parts.slice(-1)[0].endsWith('.js')) {
          const filePath = ['vendor', ...parts.slice(1)].join('/');
          console.log('streaming JS source file', filePath);
          const fs = require('fs'); // TODO: nodejs specific
          const stream = fs.createReadStream(filePath);
          return responder.sendStream(stream, 'application/javascript');
        }
        return responder.sendJson({error: 'not-found'}, 404);
      },
    };

    let webServer;
    if (this.Config.Command === 'serve') {
      webServer = new HttpServer(this.TODO, async hostname => {
        //console.log('building hostname', hostname);
        //return await vhost[`handle${method}`](meta, responder);
        return mainVHost;
      });
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
