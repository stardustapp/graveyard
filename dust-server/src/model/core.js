function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

class ObjectDataBase {
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
        //projects.createIndex('repoIds', 'repoIds', { unique: true, multiEntry: true });
        const objects = upgradeDB.createObjectStore('objects', { keyPath: ['projectId', 'objectId'] });
        objects.createIndex('by parent', ['projectId', 'parentObject', 'name'], { unique: true });
        //objects.createIndex('projectId', 'projectId', { unique: false });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['projectId', 'objectId', 'recordId'] });
        /*resources.createIndex('pid', 'pid', { unique: false });
        resources.createIndex('pidPath', ['pid', 'path'], { unique: true });
        const datums = upgradeDB.createObjectStore('datums', { keyPath: 'did' });
        datums.createIndex('pid', 'pid', { unique: false });*/
        const events = upgradeDB.createObjectStore('events', { keyPath: ['projectId', 'timestamp'] });
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

  async deleteEverything() {
    const tx = this.idb.transaction(
        ['projects', 'objects', 'records', 'events'], 'readwrite');
    tx.objectStore('projects').clear();
    tx.objectStore('objects').clear();
    tx.objectStore('records').clear();
    tx.objectStore('events').clear();
    await tx.complete;
  }

  async deleteProject(projectId) {
    const tx = this.idb.transaction(
        ['projects', 'objects', 'records', 'events'], 'readwrite');
    tx.objectStore('projects').delete(projectId);
    tx.objectStore('objects').delete(IDBKeyRange.bound([projectId, '#'], [projectId, '~']));
    tx.objectStore('records').delete(IDBKeyRange.bound([projectId, '#', '#'], [projectId, '~', '~']));
    tx.objectStore('events').delete(IDBKeyRange.bound([projectId, '#'], [projectId, '~']));
    await tx.complete;
  }

  async getAllProjects() {
    return await this.idb
      .transaction('projects')
      .objectStore('projects')
      .getAll();
  }

  async createProject({forceId, metadata, objects}) {
    const tx = this.idb.transaction(
        ['projects', 'objects', 'events'], 'readwrite');

    const projectId = forceId || randomString(3);
    const currentDate = new Date;

    // write out the project itself
    metadata.createdAt = currentDate;
    try {
      await tx.objectStore('projects').add({
        projectId,
        version: 1,
        metadata,
      });
    } catch (err) {
      tx.complete.catch(() => {}); // throw away tx failure
      if (err.name === 'ConstraintError') throw new Error(
        `Project ID '${projectId}' already exists`);
      throw err;
    }

    // TODO: check for existing objects and events, fail or clean

    // optionally create some initial objects
    const objActions = [];
    for (const objectConfig of objects || []) {
      if (!objectConfig) throw new Error(`Null object config given`);
      const objectId = randomString(3);
      const objVersion = objectConfig.version || 1;
      delete objectConfig.version;

      tx.objectStore('objects').add({
        projectId,
        objectId,
        version: objVersion,
        config: objectConfig,
      });
      objActions.push({
        type: 'create object',
        objectId,
        version: objVersion,
        config: objectConfig,
      });
    }

    // seed the events
    tx.objectStore('events').add({
      projectId,
      timestamp: currentDate,
      entries: [{
        type: 'initial horizon',
      }, {
        type: 'update project metadata',
        version: 1,
        metadata,
      }, ...objActions],
    });

    // finish it out
    await tx.complete;
    return await Project.load(this, projectId);
  }

  loadProject(projectId) {
    return Project.load(this, projectId);
  }

  /*async getStore(project, key) {
    if (repoName in project.repos) {
      const repoId = project.repos[repoName];
      return this.getStore(repoId, engine);
    }

    // doesn't exist; make the repo
    const document = {
      projectId: projectId,
      repoName: 
      createdAt: new Date,
      engine: engine.engineId,
      version: 1,
    };

    const tx = this.idb
      .transaction(['projects', 'repos'], 'readwrite');
    tx.objectStore('repos').add(document);

    const latestProject = await this.idb
      .objectStore('projects').get(projectId);
    if (latestProject.version )

    await tx.complete;
    return document.projectId;
  }
  async getStore(projectId, repoName, engine) {
    const project = this.getProject(projectId);
    if (repoName in project.repos) {
      return new engine(new ItemStore(this, projectId, project.repos[repoName]));
    }
  }*/
}

class Project {
  static async load(db, projectId) {
    const tx = await db.idb
      .transaction(['projects', 'objects']);
    const record = await tx
      .objectStore('projects')
      .get(projectId);
    if (!record) throw new Error(`project-missing:
      Project '${projectId}' not found.`);
    const objects = await tx
      .objectStore('objects')
      .getAll(IDBKeyRange.bound([projectId, '#'], [projectId, '~']));
      //.index('projectId').getAll(projectId);
    return new Project(db, record, objects);
  }

  constructor(db, record, objects) {
    this.db = db;
    this.record = record;

    this.objects = new Map;
    for (const object of objects) {
      this.loadObjectFromRecord(object);
    }
  }

  async createObject(config) {
    if (!config) throw new Error(`Null object config given`);
    const {projectId} = this.record;
    const tx = this.db.idb.transaction(
        ['objects', 'events'], 'readwrite');

    // check for name conflicts
    if (config.name) {
      const allObjects = await tx
        .objectStore('objects')
        .getAll(IDBKeyRange.bound([projectId, '#'], [projectId, '~']));
      if (allObjects.find(obj => obj.config.name === config.name))
        throw new Error(`An object named '${config.name}' already exists in this project`);
    }

    const objectId = randomString(3);
    const record = {
      projectId,
      objectId,
      version: 1,
      config,
    };
    tx.objectStore('objects').add(record);
    tx.objectStore('events').add({
      projectId,
      timestamp: new Date,
      entries: [{
        type: 'create object',
        objectId,
        version: 1,
        config,
      }],
    });

    // finish it out
    await tx.complete;
    return await this.loadObjectFromRecord(record);
  }

  loadObjectFromRecord(record) {
    //console.log('config', record);
    if (this.objects.has(record.objectId)) throw new Error(
      `Object ${record.objectId} is already loaded`);
    const objClass = OBJECT_TYPES[record.config.type];
    if (!objClass) throw new Error(
      `Object type '${record.config.type}' not found`);
    const object = new objClass(this, record);
    this.objects.set(record.objectId, object);
    return object;
  }
}

function readField(key, input, config, context) {
  const {type, required, choices} = config;
  if (input == null && context === 'insert' && 'insertionDefault' in config) {
    input = config['insertionDefault'];
  }
  if (context === 'update' && 'updateDefault' in config) {
    input = config['updateDefault'];
  }
  if (input == null && required !== false) {
    throw new Error(`Field '${key}' is required, but was null`);
  }
  if (input != null) {
    //console.log('key', key, input, config);
    switch (config.type) {
      case 'core/timestamp':
        if (input === 'now') return new Date;
        if (input.constructor !== Date) throw new Error(
          `Date field '${key}' not recognized`);
        break;
      case 'core/string':
        if (input.constructor !== String) throw new Error(
          `String field '${key}' not recognized`);
        break;
      default:
        throw new Error(`'${config.type}' field '${key}' not recognized`);
    }
    if (config.choices) {
      if (!config.choices.includes(input)) throw new Error(
        `Field '${key}' must be one of ${config.choices} but was '${input}'`);
    }
    return input;
  }
  return null;
}

/*
class BucketRepo {
  constructor(db, record) {
    this.record = record;
    this.latest = new TreeStoreEngine(db, record.repoId, ['latest']);
    this.changes = new LogStoreEngine(db, record.repoId, ['changes']);
    console.log('setting up bucket');
  }
}
class DvcsRepo {
  constructor(db, record) {
    /const repoDocs = [{
      key: 'workdir',
      engine: 'tree',
    },{
      key: 'index',
      engine: 'log',
    },{
      key: 'head',
      engine: 'box',
    },{
      key: 'refs',
      engine: 'collection',
    },{
      key: 'objects',
      engine: 'collection',
    }];/
    this.record = record;
    console.log('setting up dvcs');
  }
}
REPO_ENGINES = {
  bucket: BucketRepo,
  dvcs: DvcsRepo,
};

class TreeStoreEngine {
  constructor(db, repoId, pathPrefix) {
    this.db = db;
    this.repoId = repoId;
    this.pathPrefix = pathPrefix;
    console.log('setting up tree store');
  }
}

class LogStoreEngine {
  constructor(db, repoId, pathPrefix) {
    this.db = db;
    this.repoId = repoId;
    this.pathPrefix = pathPrefix;
    console.log('setting up log store');
  }
}

class CollectionStoreEngine {
  constructor(db, repoId, pathPrefix) {
    this.db = db;
    this.repoId = repoId;
    this.pathPrefix = pathPrefix;
    console.log('setting up collection store');
  }
}

class BoxStoreEngine {
  constructor(db, repoId, pathPrefix) {
    this.db = db;
    this.repoId = repoId;
    this.pathPrefix = pathPrefix;
    console.log('setting up box store');
  }
}
*/

