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

    const daemonStore = await RawVolatileStore.new({
      engineKey: 'graph-daemon/v1-beta1',
      topData: {
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
      },
    });

    const daemonNode = await daemonStore.getTopNode();
    const {GitHash, Config} = daemonNode;

  /*
    const graphWorld = await Config.DataPath.ifPresent(
      dataPath => RawLevelStore.openGraphWorld(dataPath),
      orElse => RawVolatileStore.openGraphWorld());
  */

  console.debug('Opening world store');

    const graphStore = await RawDynamoDBStore.new({
    //const graphStore = await RawVolatileStore.new({
      engineKey: 'graph-store/v1-beta1',
      tablePrefix: 'DustGraph',
    });
    const graphWorld = await graphStore.getTopNode();

    console.debug('Loaded system!!!!');


    let webServer;
    if (Config.Command === 'serve') {
      webServer = new HttpServer(this.TODO, hostname => new VirtualHost(hostname, null));
      //ExposeSkylinkOverHttp(this.systemEnv, webServer);
      await webServer.startServer({
        host: Config.HttpHost,
        port: Config.HttpPort || 9237,
      });
    }

    //console.log(instance.type.relations);

    // GET DUST MANAGER

    const manager = await graphWorld.findOrCreateGraph({
      engineKey: 'dust-manager/v1-beta1',
      gitHash: GitHash,
      fields: {
        system: true,
      },
    });



    // INSTALL PACKAGE
    const appKey = Config.PackageKey;
    console.log('\r--> graph-daemon.lifecycle now setting up Dust app', appKey);

    //const {pocRepository, compileToHtml} = GraphEngine
    //  .get('dust-app/v1-beta1').extensions;

    const appPackage = await manager.findOrInstallByPackageKey(graphWorld, appKey);

    //await LaunchRepl({serverDb, graphWorld, instance, appKey, pocRepository, appGraph});
      /*
    const appInst = Array.from(appGraph.roots)[0];
*/
    return {
      //Config,
      webServer,
      graphStore,
      graphWorld,
      //runtime,
      daemonNode,
      daemonStore,
      appGraph,
    };
  },

};
