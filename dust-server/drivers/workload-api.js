window.WorkloadApiDriver = class WorkloadApiDriver extends PlatformApi {
  constructor(account, pkg, appRec, wlKey) {
    super(`workload ${appRec} ${wlKey}`);
    this.account = account;
    this.package = pkg;
    this.appRec = appRec;
    this.wlRec = pkg.record.workloads[wlKey];

    console.debug('------------ workloads app api boot ------------', account, pkg, appRec, this.wlRec);

    this.getter('/display name', String, () => this.wlRec.displayName);
    this.getter('/type', String, () => this.wlRec.type);
    this.getter('/config/runtime type', String, () => this.wlRec.runtime);
    this.getter('/config/source uri', String, () => this.wlRec.sourceUri);

    console.log(Kernel.Instance.workloadManager.daemonPromises);

    switch (this.wlRec.type) {
      case 'daemon':
        console.info('workload api daemon', )
        this.getter('/status', String, () => {});
        this.getter('/session', String, () => {});
        this.function('/restart', {
          impl() {
            //console.log('restart', this.wlRec.);
          }
        });
        break;

      case 'function':
        break;
    }
  }
}
