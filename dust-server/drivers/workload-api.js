window.WorkloadApiDriver = class WorkloadApiDriver extends PlatformApi {
  constructor(account, pkg, appRec, workload) {
    super(`workload ${appRec} ${workload.record.wlKey}`);
    this.account = account;
    this.package = pkg;
    this.appRec = appRec;
    this.workload = workload;
    this.wlRec = pkg.record.workloads[workload.record.wlKey];
    if (!this.wlRec) {
      throw new Error(`no wlRec`);
    }

    console.debug('------------ workloads app api boot ------------', account, pkg, appRec, workload, this.wlRec);

    this.getter('/display name', String, () => this.wlRec.displayName);
    this.getter('/type', String, () => this.wlRec.type);
    this.getter('/config/runtime type', String, () => this.wlRec.runtime);
    this.getter('/config/source uri', String, () => this.wlRec.sourceUri);

    console.log(Kernel.Instance.workloadManager.daemonPromises);

    switch (this.wlRec.type) {
      case 'daemon':
        console.info('workload api daemon', )
        this.getter('/has worker', Boolean, () => !!workload.worker);
        this.getter('/session uri', String, () => workload.session.uri);
        this.function('/restart', {
          async impl() {
            console.log('restarting', workload, 'on user request');
            await workload.stop('restart');
            await workload.init();
          }
        });
        break;

      case 'function':
        break;
    }
  }
}
