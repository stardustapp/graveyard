class Kernel {
  constructor() {
    this.systemEnv = new Environment();
  }

  async init() {
    console.group('ServiceWorker boot');
    try {

      this.softwareDB = await OpenSoftwareDatabase();
      console.log('BOOT: Opened software database');

    } finally {
      console.groupEnd();
    }
  }
}