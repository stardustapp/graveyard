window.AppApiDriver = class AppApiDriver extends PlatformApi {
  constructor(account, pkg, appRec) {
    super('app '+appRec.appKey);

    this.account = account;
    this.appRec = appRec;
    this.package = pkg;
    console.log('app api', account, appRec, pkg);

    this.getter('/always on', Boolean, () => appRec.alwaysOn);
    this.getter('/mounts', String, () => JSON.stringify(appRec.mounts));
    this.getter('/pid', String, () => pkg.record.pid);

    this.ready = this.init();
  }

  async init() {
    const workloads = await Kernel.Instance.workloadManager
      .listAppWorkloads('aid', this.account.record.aid, this.appRec.appKey);
    for (const workload of workloads) {
      console.log('app api workload', workload);
      // TODO: canonical PlatformApi support for sub-devices
      this.env.bind(`/workloads/${workload.record.wlKey}`, new WorkloadApiDriver(this.account, this.package, this.appRec, workload));
    }
  }
/*
    this.function('/new', {
      input: {
        lifetime: 'long',
        client: 'sessions api',
      },
      output: {
        id: String,
        url: String,
      },
      impl: this.newSession,
    });
*/

  //newSession({lifetime, client}) {
  //  throw new Error('TODO');
  //}
}
