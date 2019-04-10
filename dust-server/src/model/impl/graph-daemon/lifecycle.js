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

    console.log(await daemonStore.getTopNode());
    const {GitHash, Config} = await daemonStore.getTopNode();

  /*
    const graphWorld = await Config.DataPath.ifPresent(
      dataPath => RawLevelStore.openGraphWorld(dataPath),
      orElse => RawVolatileStore.openGraphWorld());
  */
    const graphWorld = RawVolatileStore.new

    console.debug('Loaded system!!!!');


    let webServer;
    if (Config.Command === 'serve') {
      webServer = new HttpServer(this.TODO, hostname => new VirtualHost(hostname, null));
      //ExposeSkylinkOverHttp(this.systemEnv, webServer);
      await webServer.startServer({
        host: Config.HttpHost.orElse(null),
        port: Config.HttpPort.orElse(9237),
      });
    }

    //console.log(instance.type.relations);

    // INSTALL PACKAGE
    const appKey = Config.PackageKey.orElse();
    console.log('\r--> graph-daemon.lifecycle now setting up Dust app', appKey);

    const {pocRepository, compileToHtml} = GraphEngine
      .get('dust-app/v1-beta1').extensions;

    appGraph = await graphWorld.findGraph({
      engineKey: 'dust-app/v1-beta1',
      fields: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
      },
    });
    if (!appGraph) {
      appGraph = await pocRepository.installWithDeps(graphWorld, appKey);
    }
    if (!appGraph) throw new Error(
      `App installation ${JSON.stringify(appKey)} not found`);

    //await LaunchRepl({serverDb, graphWorld, instance, appKey, pocRepository, appGraph});
      /*
    const appInst = Array.from(appGraph.roots)[0];
*/
    return {
      //Config,
      webServer,
      //graphWorld,
      runtime,
    };
  },

};
