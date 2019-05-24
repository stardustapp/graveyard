Kernel = class Kernel extends PlatformApi {
  constructor(argv) {
    super('kernel');

    this.function('/Components/Register', { input: {
      type: String,
      key: String,
      'load source': String,
      data: String, // JSON
    }, impl: ({type, key, loadSource, data}) => {
      const constrFunc = {
        Connection: KernelConnection,
        Daemon: KernelDaemon,
        Service: KernelService,
      }[type];
      if (!constrFunc) throw new Error(
        `Failed to register component '${key}' of unknown type '${type}'`);

      const component = new constrFunc(key, JSON.parse(data));
      this.env.bind(`/Components/${type}s/${key}`, component);
    }});

    //this.systemEnv = new Environment();
    this.ready = this.init(argv);
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
    const engine = await GraphEngine.load('graph-daemon/v1-beta1');
    this.daemonInstance = await engine.buildUsingVolatile({argv});
    return this;
  }

  async boot() {
    // create a root environment using GateApi
    //this.gateApi = new GateApi(this.systemEnv, this.accountManager, this.sessionManager, this.domainManager, this.packageManager);

    return this.daemonInstance.boot(this);
    //await this.workloadManager.boot();
  }

  // should run for the lifetime of the runtime, returning will shut down
  run() {
    return this.daemonInstance.run(this);
  }

  unref() {
    this.daemonInstance.unref();
    throw new Error(`TODO: shutdown`);
  }
}
