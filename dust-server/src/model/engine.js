function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

class GraphObject {
  constructor(graph, record) {
    this.graph = graph;
    this.record = record;
  }
}

const GraphEngines = new Map;
class GraphEngine {
  constructor(key, builder) {
    if (GraphEngines.has(key)) throw new Error(
      `Graph Engine ${key} is already registered, can't re-register`);

    this.engineKey = key;
    this.names = builder.names;
    GraphEngines.set(key, this);
  }

  static get(key) {
    if (!GraphEngines.has(key)) throw new Error(
      `Graph Engine ${JSON.stringify(key)} is not registered`);
    return GraphEngines.get(key);
  }
}

class GraphTxn {
  constructor(txn) {
    this.txn = txn;
    this.currentDate = new Date;
  }

  async purgeGraph(graphId) {
    this.txn.objectStore('graphs').delete(graphId);
    this.txn.objectStore('events').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));

    const objIds = await this.txn.objectStore('objects').index('by graph').getAllKeys(graphId);
    console.warn('Objects to delete:', objIds);
    //this.txn.objectStore('objects').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
    //this.txn.objectStore('records').delete(IDBKeyRange.bound([graphId, '#', '#'], [graphId, '~', '~']));
  }

  async createGraph(options={}) {
    const graphId = options.forceId || randomString(3);

    // write out the graph itself
    try {
      await this.txn.objectStore('graphs').add({
        graphId,
        version: 1,
        createdAt: this.currentDate,
        updatedAt: this.currentDate,
        metadata: options.metadata,
      });
    } catch (err) {
      this.txn.complete.catch(() => {}); // throw away tx failure
      if (err.name === 'ConstraintError') throw new Error(
        `Graph ID '${graphId}' already exists`);
      throw err;
    }

    // seed the events
    await this.txn.objectStore('events').add({
      graphId,
      timestamp: this.currentDate,
      entries: [{
        type: 'initial horizon',
      }, {
        type: 'update graph metadata',
        version: 1,
        data: options.metadata,
      }],
    });
  }

  createObjects(graphId, objects) {
    const actions = [];
    const ops = [];

    for (const object of objects) {
      if (!object) throw new Error(
        `Null object given`);
      if (object.constructor !== GraphBuilderNode) throw new Error(
        `Wasn't given a GraphBuilderNode`);

      const objectId = randomString(3);

      const {type, parent, name, version, data} = object;
      ops.push(this.txn.objectStore('objects').add({
        graphId, objectId,
        refObjIds: [], // TODO
        parentObjId: object.parentObjId, // TODO from object.paraent
        type, name, version, data,
      }));

      actions.push({
        type: 'create object',
        objectId,
        refObjIds: [], // TODO
        parentObjId: object.parentObjId, // TODO from object.paraent
        type, name, version, data,
      });
    }

    // store the change events
    ops.push(this.txn.objectStore('events').add({
      graphId,
      timestamp: this.currentDate,
      entries: actions,
    }));

    return Promise.all(ops);
  }

  finish() {
    return this.txn.complete;
  }
}

class GraphStore {
  constructor(idbName='graph-worker') {
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
        const objects = upgradeDB.createObjectStore('objects', { keyPath: 'objectId' });
        objects.createIndex('by graph', 'graphId', { multiEntry: true });
        objects.createIndex('by parent', ['parentObjId', 'name'], { unique: true });
        objects.createIndex('referenced', 'refObjIds', { multiEntry: true });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['objectId', 'recordId'] });
        const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
    }
  }

  async openIdb() {
    if (this.idb) throw new Error(`Can't reopen IDB`);
    await idb.delete(this.idbName);
    console.warn('Dropped IDB database from previous run');
    this.idb = await idb.open(this.idbName, 1, this.migrateIdb.bind(this));
    console.debug('IDB opened');
  }

  async closeIdb() {
    this.ready = null;
    if (!this.idb) return;
    console.debug('Closing IDB');
    const shutdown = this.idb.close();
    this.idb = null;
    await shutdown;
  }

  startTransaction(mode='readonly') {
    return new GraphTxn(this.idb
      .transaction(['graphs', 'objects', 'records', 'events'], mode));
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

  async listAllGraphs() {
    return await this.idb
      .transaction('graphs')
      .objectStore('graphs')
      .getAll();
  }

  async deleteGraph(graphId) {
    const tx = this.idb.transaction(
        ['graphs', 'objects', 'records', 'events'], 'readwrite');

    tx.objectStore('graphs').delete(graphId);
    tx.objectStore('events').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));

    const objIds = await tx.objectStore('objects').index('by graph').getAllKeys(graphId);
    console.warn('Objects to delete:', objIds);
    //tx.objectStore('objects').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
    //tx.objectStore('records').delete(IDBKeyRange.bound([graphId, '#', '#'], [graphId, '~', '~']));

    await tx.complete;
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
