Kernel = class Kernel {
  constructor(db) {
    this.systemEnv = new Environment();
    this.ready = this.init(db);
  }

  async init(db) {
    this.packageManager = await new PackageManager(db).ready;
    this.accountManager = new AccountManager(db, this.packageManager);
    this.sessionManager = new SessionManager(db, this.accountManager);
    this.domainManager = await new DomainManager(db, this.accountManager).ready;
    this.workloadManager = new WorkloadManager(db, this.sessionManager, {
      aid: this.accountManager,
    });
    return this;
  }

  async boot() {
    // create a root environment using GateApi
    this.gateApi = new GateApi(this.systemEnv, this.accountManager, this.sessionManager, this.domainManager, this.packageManager);

    await this.workloadManager.boot();
  }
}
