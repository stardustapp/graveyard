const os = require('os');
const process = require('process');
const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
const asyncTimeout = promisify(setTimeout);

async function execForLine(cmd) {
  const {stdout, stderr} = await exec("git describe --always --long --dirty");
  if (stderr.length > 0) {
    console.warn('WARN: exec() stderr:', stderr);
  }
  return stdout.trim();
}

const extensions = GraphEngine.extend('graph-daemon/v1-beta1');
extensions.lifecycle = {

  fromProcessArgs(argv) {
    return this.createServer({
      DataPath: argv.dataPath,
      Command: argv.command,
      PackageKey: argv.package,
      MethodName: argv.method,
      HttpPort: argv.port,
      HttpHost: argv.host,
    });
  },

  async createServer(config) {
    //console.log('creating server with config', config);

    const daemonEngine = GraphEngine.get('graph-daemon/v1-beta1');

    const instance = daemonEngine.spawnTop({
      CreatedAt: new Date,
      GitHash: await execForLine(`git describe --always --long --dirty`),
      Config: config,
      Host: {
        Platform: os.platform(),
        Release: os.release(),
        Architecture: os.arch(),
        Runtime: 'nodejs',
        HostName: os.hostname(),
        UserName: os.userInfo().username,
        HomeDir: os.homedir(),
        WorkDir: process.cwd(),
      },
    });

    //const storeImpl = new RawVolatileStore(engine, serverDb);

    const graphStore = await RawLevelStore.open(daemonEngine, instance.Config.DataPath);
    //const runtime = new GraphRuntime(graphStore, instance);
    //await runtime.ready;
    console.debug('Loaded system!!!!');


    let webServer;
    if (instance.Config.Command === 'serve') {
      webServer = new HttpServer(this.TODO, hostname => new VirtualHost(hostname, null));
      //ExposeSkylinkOverHttp(this.systemEnv, webServer);
      await webServer.startServer({
        port: instance.Config.HttpPort,
      });
    }

    //console.log(instance.type.relations);

    console.log('\r--> graph-daemon.lifecycle now setting up Dust app', instance.Config.PackageKey);

    // INSTALL PACKAGE
    const appKey = instance.Config.PackageKey;
    const {pocRepository, compileToHtml} = GraphEngine
      .get('dust-app/v1-beta1').extensions;

    appGraph = await graphStore.findGraph({
      engineKey: 'dust-app/v1-beta1',
      fields: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
      },
    });
    if (!appGraph) {
      appGraph = await pocRepository.installWithDeps(graphStore, appKey);
    }
    if (!appGraph) throw new Error(
      `App installation ${JSON.stringify(appKey)} not found`);

    //await LaunchRepl({serverDb, graphStore, instance, appKey, pocRepository, appGraph});
      /*
    const appInst = Array.from(appGraph.roots)[0];
*/
    return {
      instance,
      webServer,
      //graphStore,
      runtime,
    };
  },

};
