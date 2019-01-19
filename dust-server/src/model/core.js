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
        const graphs = upgradeDB.createObjectStore('graphs', { keyPath: 'graphId' });
        //graphs.createIndex('repoIds', 'repoIds', { unique: true, multiEntry: true });
        const objects = upgradeDB.createObjectStore('objects', { keyPath: ['graphId', 'objectId'] });
        objects.createIndex('by parent', ['graphId', 'parentObject', 'name'], { unique: true });
        //objects.createIndex('graphId', 'graphId', { unique: false });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['graphId', 'objectId', 'recordId'] });
        /*resources.createIndex('pid', 'pid', { unique: false });
        resources.createIndex('pidPath', ['pid', 'path'], { unique: true });
        const datums = upgradeDB.createObjectStore('datums', { keyPath: 'did' });
        datums.createIndex('pid', 'pid', { unique: false });*/
        const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
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
        ['graphs', 'objects', 'records', 'events'], 'readwrite');
    tx.objectStore('graphs').clear();
    tx.objectStore('objects').clear();
    tx.objectStore('records').clear();
    tx.objectStore('events').clear();
    await tx.complete;
  }

  async deleteGraph(graphId) {
    const tx = this.idb.transaction(
        ['graphs', 'objects', 'records', 'events'], 'readwrite');
    tx.objectStore('graphs').delete(graphId);
    tx.objectStore('objects').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
    tx.objectStore('records').delete(IDBKeyRange.bound([graphId, '#', '#'], [graphId, '~', '~']));
    tx.objectStore('events').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
    await tx.complete;
  }

  async getAllGraphs() {
    return await this.idb
      .transaction('graphs')
      .objectStore('graphs')
      .getAll();
  }

  async createGraph({forceId, fields, objects}) {
    const tx = this.idb.transaction(
        ['graphs', 'objects', 'events'], 'readwrite');

    const graphId = forceId || randomString(3);
    const currentDate = new Date;

    // write out the graph itself
    fields.createdAt = currentDate;
    try {
      await tx.objectStore('graphs').add({
        graphId,
        version: 1,
        fields,
      });
    } catch (err) {
      tx.complete.catch(() => {}); // throw away tx failure
      if (err.name === 'ConstraintError') throw new Error(
        `Graph ID '${graphId}' already exists`);
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
        graphId,
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
      graphId,
      timestamp: currentDate,
      entries: [{
        type: 'initial horizon',
      }, {
        type: 'update graph fields',
        version: 1,
        fields,
      }, ...objActions],
    });

    // finish it out
    await tx.complete;
    return await Graph.load(this, graphId);
  }

  loadGraph(graphId) {
    return Graph.load(this, graphId);
  }

  /*async getStore(graph, key) {
    if (repoName in graph.repos) {
      const repoId = graph.repos[repoName];
      return this.getStore(repoId, engine);
    }

    // doesn't exist; make the repo
    const document = {
      graphId: graphId,
      repoName: 
      createdAt: new Date,
      engine: engine.engineId,
      version: 1,
    };

    const tx = this.idb
      .transaction(['graphs', 'repos'], 'readwrite');
    tx.objectStore('repos').add(document);

    const latestGraph = await this.idb
      .objectStore('graphs').get(graphId);
    if (latestGraph.version )

    await tx.complete;
    return document.graphId;
  }
  async getStore(graphId, repoName, engine) {
    const graph = this.getGraph(graphId);
    if (repoName in graph.repos) {
      return new engine(new ItemStore(this, graphId, graph.repos[repoName]));
    }
  }*/
}

class Graph {
  static async load(db, graphId) {
    const tx = await db.idb
      .transaction(['graphs', 'objects']);
    const record = await tx
      .objectStore('graphs')
      .get(graphId);
    if (!record) throw new Error(`graph-missing:
      Graph '${graphId}' not found.`);
    const objects = await tx
      .objectStore('objects')
      .getAll(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
      //.index('graphId').getAll(graphId);
    return new Graph(db, record, objects);
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
    const {graphId} = this.record;
    const tx = this.db.idb.transaction(
        ['objects', 'events'], 'readwrite');

    // check for name conflicts
    if (config.name) {
      const allObjects = await tx
        .objectStore('objects')
        .getAll(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
      if (allObjects.find(obj => obj.config.name === config.name))
        throw new Error(`An object named '${config.name}' already exists in this graph`);
    }

    const objectId = randomString(3);
    const record = {
      graphId,
      objectId,
      version: 1,
      config,
    };
    tx.objectStore('objects').add(record);
    tx.objectStore('events').add({
      graphId,
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

