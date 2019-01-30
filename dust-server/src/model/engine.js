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
        objects.createIndex('referenced', 'refObjIds', { multiEntry: true });
        objects.createIndex('by parent', ['parentObjId', 'name'], { unique: true });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['objectId', 'recordId'] });
        const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
    }
  }

  async openIdb() {
    if (this.idb) throw new Error(`Can't reopen IDB`);
    //await idb.delete(this.idbName);
    //console.warn('Dropped IDB database from previous run');
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

  async transact(mode='readonly', cb) {
    const idbTx = this.idb.transaction(['graphs', 'objects', 'records', 'events'], mode);
    console.group(`${mode} graph transaction`);

    try {
      const txn = new GraphTxn(this, idbTx, mode);
      await cb(txn);
      await txn.finish();

    } catch (err) {
      if (idbTx.error) {
        console.warn('IDB transaction failed:', idbTx.error);
        throw idbTx.error;
      }
      console.error('GraphTxn crash:', err);
      console.warn('Aborting IDB transaction due to', err.name);
      idbTx.abort();
      throw new Error(`GraphTxn rolled back due to ${err.stack.split('\n')[0]}`);

    } finally {
      console.groupEnd();
    }
  }

  deleteEverything() {
    return this.transact('readwrite', async txn => {
      console.warn('!! DELETING ALL GRAPHS AND DATA !!');
      await txn.txn.objectStore('graphs').clear();
      await txn.txn.objectStore('objects').clear();
      await txn.txn.objectStore('records').clear();
      await txn.txn.objectStore('events').clear();
      txn._addAction(null, {
        type: 'purge all',
      });
    });
  }

  async listAllGraphs() {
    return await this.idb
      .transaction('graphs')
      .objectStore('graphs')
      .getAll();
  }

  loadGraph(graphId) {
    return Graph.load(this, graphId);
  }

  async processEvent({timestamp, graphId, entries}) {
    for (const entry of entries) {
      //console.warn('"processing" event', timestamp, graphId, entry);
    }
  }
}
