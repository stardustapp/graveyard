Kernel = class Kernel {
  constructor(db) {
    this.systemEnv = new Environment();
    this.ready = this.init(db);
  }

  async init(db) {
    console.warn('\r!-> todo: impl node kernel');
    return this;
  }

  async boot() {
    // create a root environment using GateApi
    this.gateApi = new GateApi(this.systemEnv, this.accountManager, this.sessionManager, this.domainManager, this.packageManager);

    //await this.workloadManager.boot();
  }
}
