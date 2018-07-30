window.AppApiDriver = class AppApiDriver extends PlatformApi {
  constructor(account, pkg, appRec) {
    super('app '+appRec.appKey);

    this.account = account;
    this.appRec = appRec;
    this.package = pkg;
    console.log('app api', account, appRec, pkg);

    this.getter('/always%20on', Boolean, () => appRec.alwaysOn);
    this.getter('/mounts', String, () => JSON.stringify(appRec.mounts));
    this.getter('/pid', String, () => pkg.record.pid);

    for (const wlKey in pkg.record.workloads) {
      console.log('app api wl', wlKey);
      // TODO: canonical PlatformApi support for sub-devices
      this.env.bind(`/workloads/${wlKey}`, new WorkloadApiDriver(account, pkg, appRec, wlKey));
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
  }

  //newSession({lifetime, client}) {
  //  throw new Error('TODO');
  //}
}
