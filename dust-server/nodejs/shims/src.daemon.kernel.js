const {promisify} = require('util');
const asyncTimeout = promisify(setTimeout);

Kernel = class Kernel {
  constructor(argv) {
    this.systemEnv = new Environment();
    this.ready = this.init(argv);
  }

  async init(argv) {
    const {lifecycle} = GraphEngine.get('graph-daemon/v1-beta1').extensions;

    self.DUST = this.server = await lifecycle.fromProcessArgs(argv);
    console.debug('Created server.');

    return this;
  }

  // expected to return within 30 seconds
  async boot() {
    const {Config} = this.server.instance;

    this.appGraph = await this.server.runtime.findGraph({
      engineKey: 'dust-app/v1-beta1',
      fields: { foreignKey: Config.PackageKey },
    });
    if (!appGraph) throw new Error(
      `Dust app ${JSON.stringify(Config.PackageKey)} not found locally`);

  }

  // should run for the lifetime of the runtime
  // return to EXIT
  async run() {
    const {Config} = this.server.instance;
    switch (Config.Command) {

      case 'run':
        const serverMethod = this.appGraph.selectNamed(Config.MethodName);
        const {JS} = serverMethod.data.Fields;

        console.log('Starting ServerMethod now!');
        await eval(JS).call().call().call(null, this);
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
  }

  unref() {
    if (this.webServer)
      this.webServer.unref();
  }
}
