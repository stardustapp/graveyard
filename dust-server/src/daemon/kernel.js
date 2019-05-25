Kernel = class Kernel extends PlatformApi {
  constructor(argv, gitHash) {
    super('kernel');

    this.getter('/git hash', String, () => gitHash);
    this.function('/register Component', { input: {
      type: String,
      key: String,
      'load source': String,
      data: Object, // JSON
    }, impl: ({type, key, loadSource, data}) => {
      const constrFunc = {
        Connection: KernelConnection,
        Daemon: KernelDaemon,
        Service: KernelService,
      }[type];
      if (!constrFunc) throw new Error(
        `Failed to register component '${key}' of unknown type '${type}'`);
      this.registerComponent(new constrFunc(key, data));
    }});

    this.allConnections = new Array;
    this.allDaemons = new Array;
    this.allServices = new Array;

    this.gitHash = gitHash;
    this.ready = this.init(argv);
  }

  registerComponent(component) {
    this[`all${component.type}s`].push(component);
    this.env.bind(`/Components/${component.type}s/${component.key}`, component);
  }

  async init(argv) {
    /* TODO: move to a KernelLoader
    this.packageManager = await new PackageManager(db).ready;
    this.accountManager = new AccountManager(db, this.packageManager);
    this.sessionManager = new SessionManager(db, this.accountManager);
    this.domainManager = await new DomainManager(db, this.accountManager).ready;
    this.workloadManager = new WorkloadManager(db, this.sessionManager, {
      aid: this.accountManager,
    });
    */

    const engine = await GraphEngine.load('graph-store/v1-beta1');
    this.systemGraphs = await engine.buildUsingVolatile();
    return this;
  }

  findDaemonByEngine(enginePre) {
    return this.allDaemons
      .filter(x => x.data.EngineKey.startsWith(enginePre+'/'))
      .map(x => x.liveGraph)[0];
  }

  async boot() {
    // create a root environment using GateApi
    //this.gateApi = new GateApi(this.systemEnv, this.accountManager, this.sessionManager, this.domainManager, this.packageManager);

    for (const component of [
      ...this.allConnections,
      ...this.allDaemons,
      ...this.allServices,
    ]) {
      if (component.status === 'disabled') {
        console.log('Skipped disabled component', component.key);
      } else {
        console.log('Activating component', component.key, '...');
        await component.activate(this.systemGraphs, this.gitHash);
      }
    }

    //throw new Error('Kernel reached boot phase.');
    return this.findDaemonByEngine('graph-daemon').boot(this);
    //await this.workloadManager.boot();
  }

  // should run for the lifetime of the runtime, returning will shut down
  run() {
    return this.findDaemonByEngine('graph-daemon').run(this);
  }

  unref() {
    this.findDaemonByEngine('graph-daemon').unref();
    throw new Error(`TODO: shutdown`);
  }
}
