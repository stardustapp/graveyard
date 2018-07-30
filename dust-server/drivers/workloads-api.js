window.WorkloadApiDriver = class WorkloadApiDriver extends PlatformApi {
  constructor(account, pkg, appRec, wlKey) {
    super(`workload ${appRec} ${wlKey}`);
    this.account = account;
    this.package = pkg;
    this.appRec = appRec;
    this.wlRec = pkg.record.workloads[wlKey];

    console.debug('------------ workloads app api boot ------------', account, pkg, appRec, this.wlRec);
  }
}
