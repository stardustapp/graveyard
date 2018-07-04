class AppManager {
  constructor(idb) {
    this.idb = idb;
  }

  async getAppInstallsFor(account) {
    console.log('hello', account);
    return account.record.apps.map(appid => {
      return new AppInstall(appid, account);
    });
  }
}