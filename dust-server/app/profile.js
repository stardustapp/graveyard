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

    return new Profile(chartName, db);
  }

  constructor(chartName, db) {
    this.env = new Environment();
    this.chartName = chartName;
    this.db = db;
    console.log('starting profile for', chartName);

    /*
    this.env.bind('/persist', { getEntry(path) {
      throw new Error(`TODO: implement /persist for ${path} on ${chartName}`);
    }});
    */
    this.env.mount('/config', 'arbitrary-idb', { db, store: 'config' });
    this.env.mount('/persist', 'arbitrary-idb', { db, store: 'persist' });
    this.env.mount('/chart-name', 'literal', { string: chartName });

    // lets users manage their domains
    this.env.bind('/domains', new DomainsApi(DOMAIN_MANAGER, chartName).env);
  }

  close() {
    console.log('Closing IDB for', chartName);
    this.db.close();
    this.db = null;
  }
};
