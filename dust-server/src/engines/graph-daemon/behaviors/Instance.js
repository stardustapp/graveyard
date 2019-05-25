const {promisify} = require('util');
const execAsync = promisify(require('child_process').exec);
const setTimeoutAsync = promisify(setTimeout)
async function execForLine(cmd, {timeoutMs=1000}={}) {

  const {stdout, stderr} = await Promise.race([
    execAsync(cmd),
    setTimeoutAsync(timeoutMs).then(() => Promise.reject(new Error('execForLine() timeout'))),
  ]);
  if (stderr.length > 0)
    console.warn('WARN: exec() stderr:', stderr);
  return stdout.trim();
}

let isLaunched = false;

GraphEngine.attachBehavior('graph-daemon/v1-beta1', 'Instance', {

  // runs on every bring-up, might not be the right one
  //async setup() {  },

  async boot(kernel) {
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
      /*
      const domainHandler = await this.webServer
        .DefaultHandler.InnerRules.push({
          Conditions: [{
            Host: { Names: [
              'localhost', '127.0.0.1',
              this.dustDomain.DomainName,
              `*.${this.dustDomain.DomainName}`,
            ]},
          }],
          ForwardTo: {
            InnerRules: [{
              Conditions: [{
                PathPatterns: ['/dust-app/*'],
              }],
              ForwardTo: {
                DefaultAction: {
                  ForeignNode: {
                    Ref: this.dustManager,
                    Behavior: 'serveAppReq',
                    Input: {
                      PathDepth: 1,
                    },
                  },
                },
              },
            },{
              Conditions: [{
                PathPatterns: ['/~~vendor/*'],
              }],
              ForwardTo: {
                DefaultAction: {
                  StreamFiles: {
                    PathDepth: 1,
                    RootDir: await this.workDir.Root.getDirectory('vendor'),
                    DotFiles: 'deny',
                  },
                },
              },
            },{
              Conditions: [{
                PathPatterns: ['/~~src/*'],
              }],
              ForwardTo: {
                DefaultAction: {
                  StreamFiles: {
                    PathDepth: 1,
                    RootDir: await this.workDir.Root.getDirectory('src'),
                    DotFiles: 'deny',
                  },
                },
              },
            },{
              Conditions: [{
                PathPatterns: ['/~/*', '/~~export/*'],
              }],
              ForwardTo: {
                DefaultAction: {
                  ForeignNode: {
                    Ref: this.dustDomain,
                    Behavior: 'serveHttpRequest',
                    AllowUpgrades: ['websocket'],
                  },
                },
              },
            }],
            DefaultAction: {
              StreamFiles: {
                PathDepth: 0,
                RootDir: await this.workDir.Root.getDirectory('src/default-www'),
              },
            },
          },
        });
*/
      // const localhostHandler = await this.webServer
      //   .DefaultHandler.InnerRules[1].ForwardTo; // 'localhost'
    }
  },

  async run(kernel) {
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
        const stdout = await execForLine(`curl -sv http://127.0.0.1:9238${LaunchFlags.path}`);
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
