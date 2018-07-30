window.WorkloadApiDriver = class WorkloadApiDriver extends PlatformApi {
  constructor(account, pkg, appRec, wlKey) {
    super(`workload ${appRec} ${wlKey}`);
    this.account = account;
    this.package = pkg;
    this.appRec = appRec;
    this.wlRec = pkg.record.workloads[wlKey];

    console.debug('------------ workloads app api boot ------------', account, pkg, appRec, this.wlRec);

    this.getter('/config/display name', String, () => this.wlRec.displayName);
    this.getter('/config/runtime type', String, () => this.wlRec.runtime);
    this.getter('/config/source uri', String, () => this.wlRec.sourceUri);
    this.getter('/config/workload type', String, () => this.wlRec.type);
  }
}
