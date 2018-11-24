class Kernel {
  constructor() {
    this.systemEnv = new Environment();
  }

  async init() {
    console.group('ServiceWorker boot');

    this.softwareDB = await OpenSoftwareDatabase();
    console.log('BOOT: Opened software database');

    console.groupEnd();
  }
}