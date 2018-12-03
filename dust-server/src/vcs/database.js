class VcsDatabase {
  constructor(idbName) {
    this.idbName = idbName;
    this.idb = null;

    this.ready = this.openIdb();
  }

  async migrateIdb(upgradeDB) {
    // this switch intentionally falls through every case.
    // it allows for each case to build on the previous.
    switch (upgradeDB.oldVersion) {
      case 0:
        const projects = upgradeDB.createObjectStore('projects', { keyPath: 'projectId' });
        projects.createIndex('storeIds', 'storeIds', { unique: true, multiEntry: true });
        //const stores = upgradeDB.createObjectStore('stores', { keyPath: ['projectId', 'storeId'] });
        const data = upgradeDB.createObjectStore('data', { keyPath: ['storeId', 'dataPath'] });
        /*resources.createIndex('pid', 'pid', { unique: false });
        resources.createIndex('pidPath', ['pid', 'path'], { unique: true });
        const datums = upgradeDB.createObjectStore('datums', { keyPath: 'did' });
        datums.createIndex('pid', 'pid', { unique: false });*/
    }
  }

  async openIdb() {
    if (this.idb) throw new Error(`Can't reopen IDB`);
    this.idb = await idb.open(this.idbName, 1, this.migrateIdb.bind(this));
    console.debug('IDB opened');
  }

  async closeIdb() {
    this.ready = null;
    if (this.idb) {
      console.debug('Closing IDB');
      await this.idb.close();
      this.idb = false;
    }
  }

  randomString(bytes=10) { // 32 for a secret
    var array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    return base64js
      .fromByteArray(array)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async getAllProjects() {
    return await this.idb
      .transaction('projects')
      .objectStore('projects')
      .getAll();
  }

  async createProject(config) {
    const storeIds = new Set;
    for (const sCfg of config.stores) {
      sCfg.storeId = this.randomString();
      if (storeIds.has(sCfg.storeId))
        throw new Error('storeId clash, pls reroll');
      storeIds.add(sCfg.storeId);
    }

    const document = {
      projectId: this.randomString(),
      version: 1,
      createdAt: new Date,
      config: config,
      storeIds: Array.from(storeIds),
    };

    const tx = this.idb
      .transaction('projects', 'readwrite');
    // TODO: check that no data exists already for our store IDs
    tx.objectStore('projects')
      .add(document);
    await tx.complete;
    return document.projectId;
  }

  async openProject(projectId) {
    const record = await this.idb
      .transaction('projects')
      .objectStore('projects')
      .get(projectId);
    return new Project(this, record);
  }

  /*async getStore(project, storeKey) {
    if (storeName in project.stores) {
      const storeId = project.stores[storeName];
      return this.getStore(storeId, engine);
    }

    // doesn't exist; make the store
    const document = {
      projectId: projectId,
      storeName: 
      createdAt: new Date,
      engine: engine.engineId,
      version: 1,
    };

    const tx = this.idb
      .transaction(['projects', 'stores'], 'readwrite');
    tx.objectStore('stores').add(document);

    const latestProject = await this.idb
      .objectStore('projects').get(projectId);
    if (latestProject.version )

    await tx.complete;
    return document.projectId;
  }
  async getStore(projectId, storeName, engine) {
    const project = this.getProject(projectId);
    if (storeName in project.stores) {
      return new engine(new ItemStore(this, projectId, project.stores[storeName]));
    }
  }*/
}

class DataRepo {

}

class Project {
  constructor(db, record) {
    this.db = db;
    this.record = record;
    console.log('i exist', this);

    this.stores = {};
    for (const sCfg of this.record.config.stores) {
      console.log('loading store', sCfg);
    }
  }
}

/*
class ItemStore {
  constructor(db, projectId, storeId) {

  }
}
*/
class BucketStore {
  static get engineId() { return 'fRp2CryyKawGmemfuS5'; }

  constructor(db, store) {
    this.store = store;
  }
}


function vcsTest(cb) {
  return async function runVcsTest() {
    await idb.delete('vcs');
    const db = new VcsDatabase('vcs');
    await db.ready;
    try {
      await cb.call(this, db);
    } finally {
      await db.closeIdb();
      //await idb.delete('vcs');
    }
  };
}

vcsTests.addSuite('dvcs project setup', vcsTest(async function(db) {
  const projectId = await db
    .createProject({
      owner: 'root',
      displayName: 'Todo list',
      stores: [{
        key: 'source',
        engine: 'file-directory',
      }, {
        key: 'repo',
        engine: 'git-database',
      }],
    });

  const project = await db.openProject(projectId);
  console.debug('Got project', project);
  this.assertEq(project.record.config.displayName, 'Todo list');
  this.assertEq(project.record.version, 1);

  //const bucket = await db.openStore(projectId, 'resources', BucketStore);
  //console.debug('Opened resource store');
  //this.assertEq(resStore.)
}));
