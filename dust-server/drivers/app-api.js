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
