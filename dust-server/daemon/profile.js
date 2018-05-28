class Profile {

  static async open(chartName) {
    if (!chartName) {
      throw new Error(`Profile opened with null chartName`);
    }
    const db = await idb.open('profile:'+chartName, 1, upgradeDB => {
      switch (upgradeDB.oldVersion) {
        case 0:
          upgradeDB.createObjectStore('metadata');
          upgradeDB.createObjectStore('persist', {
            keyPath: 'nid',
          });
          upgradeDB.createObjectStore('config', {
            keyPath: 'nid',
          });
      }
    });
    console.log('Opened database for', chartName);

    return new Profile(chartName, db).init();
  }

  constructor(chartName, db) {
    this.env = new Environment();
    this.chartName = chartName;
    this.db = db;
  }

  async init() {
    const {env, db, chartName} = this;
    console.log('starting profile for', chartName);
    
    await env.mount('/config', 'idb-treestore', { db, store: 'config' });
    await env.mount('/persist', 'idb-treestore', { db, store: 'persist' });
    await env.mount('/chart-name', 'literal', { string: chartName });
    await env.bind('/domains', new DomainsApi(DOMAIN_MANAGER, chartName).env);
    return this;
  }

  close() {
    console.log('Closing IDB for', chartName);
    this.db.close();
    this.db = null;
  }
};
