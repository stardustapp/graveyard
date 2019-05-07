class Kernel {
  constructor() {
    this.systemEnv = new Environment();
  }

  async init() {
    console.group('ServiceWorker boot');
    try {

      this.graphStore = new ObjectDataBase('graph');
      await this.graphStore.ready;
      //this.softwareDB = await OpenSoftwareDatabase();
      console.log('BOOT: Opened software database');

    } finally {
      console.groupEnd();
    }
  }
}
