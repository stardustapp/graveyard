const fs = require('fs');
const os = require('os');
const {promisify} = require('util');

const rimraf = promisify(require('rimraf'));

const level = promisify(require('level'));
const sub = require('subleveldown');
const levelgraph = require('levelgraph');

function EstablishTempDir() {
  const tempDir = fs.realpathSync(os.tmpdir());
  const dbPath = fs.mkdtempSync(tempDir+'/dust-data_');

  process.once('beforeExit', async (code) => {
    try {
      await rimraf(dbPath, {
        disableGlob: true,
      });
    } catch (err) {
      console.error(`\r!-> Failed to clean server memory on shutdown: ${err.message}`);
      console.error(`Temporary data may still exist in`, dbPath);
    }
    console.log(`Cleaned server memory from disk.`);
  });

  return dbPath;
}

function AsssertWritable(fsPath) {
  try {
    fs.accessSync(fsPath, fs.constants.W_OK);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('\r--> Creating new data directory', fsPath);
    } else {
      throw new Error(`Data path ${fsPath} not writable: ${err.message}`);
    }
  }
}

function navWithCb(startAt, setupCb, cb) {
  setupCb(this.nav(startAt), cb);
}

class DataContext {
  constructor(database, mode, cb) {
    this.database = database;
    this.mode = mode;

    this.objProxies = new Map;
    this.promise = this._run(cb);
  }
  abort() {
    console.log('TODO: abort DataContext');
  }
  async _run(cb) {
    try {
      console.group('DataContext start:', this.mode);
      await cb(this);
    } catch (err) {
      console.warn('DataContext failed:', err.message);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  getObjectById(_id) {
    if (this.objProxies.has(_id))
      return this.objProxies.get(_id).ready;

    const obj = new DataObject(this, _id);
    this.objProxies.set(_id, obj);
    return obj.ready;
  }

  async queryGraph(query) {
    //return new DataObject(this);

    if (query.subject && query.subject.constructor === DataObject)
      query.subject = query.subject._id;
    if (query.object && query.object.constructor === DataObject)
      query.object = query.object._id;

    const vertices = await this.database.graph.get(query);
    const promises = vertices.map(async raw => ({
      subject: await this.getObjectById(raw.subject),
      predicate: raw.predicate,
      object: await this.getObjectById(raw.object),
    }));
    return Promise.all(promises);
  }
}

class DataObject {
  constructor(ctx, docId) {
    const isNew = !docId;
    let docFields = null;

    this.ready = (async () => {
      throw new Error('hi')
    })();

    Object.defineProperty(this, '_id', {
      enumerable: true,
      get() { return }
    })
  }
}

class ServerDatabase {
  constructor(baseLevel) {
    this.baseLevel = baseLevel;
    this.docsLevel = sub(this.baseLevel, 'docs');
    this.edgeLevel = sub(this.baseLevel, 'edge');
    this.mutex = new RunnableMutex(this.transactNow.bind(this));

    // create promisified levelgraph-alike
    const graph = levelgraph(this.edgeLevel);
    this.graph = {
      getStream: graph.getStream.bind(graph),
      putStream: graph.putStream.bind(graph),
      searchStream: graph.searchStream.bind(graph),

      get: promisify(graph.get.bind(graph)),
      put: promisify(graph.put.bind(graph)),
      search: promisify(graph.search.bind(graph)),

      generateBatch: graph.generateBatch.bind(graph),
      createQuery: graph.createQuery.bind(graph),
      nav: promisify(navWithCb.bind(graph)),
      raw: graph, // escape hatch
    };
  }

  sub(key) {
    const subLevel = sub(this.baseLevel, '-'+key);
    return new ServerDatabase(subLevel);
  }

  transactNow(mode, cb) {
    return new DataContext(this, mode, cb);
  }
}

let rootLevel = null;
class RootServerDatabase extends ServerDatabase {
  constructor(db) {
    super(db);
  }

  static async openPersisted(dataPath) {
    if (rootLevel)
      throw new Error(`RootServerDatabase double-open!`);
    AsssertWritable(dataPath);

    rootLevel = await level(dataPath);
    return new RootServerDatabase(rootLevel);
  }

  static async openTemporary() {
    const dataPath = await EstablishTempDir();
    return await this.openPersisted(dataPath);
  }

  close() {
    // TODO: worth closing if we never open more than one?
    //const p = this.rawStore.close();
    //this.rawStore = null;
    //return p;
  }
}

//await db.put('name', 'Level');
//console.log('name=' + await db.get('name'));

if (typeof module !== 'undefined') {
  module.exports = {
    ServerDatabase,
    RootServerDatabase,
    DataContext,
  };
}
