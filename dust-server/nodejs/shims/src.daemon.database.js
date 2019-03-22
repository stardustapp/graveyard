const fs = require('fs');
const os = require('os');
const {promisify} = require('util');

const rimraf = promisify(require('rimraf'));

//const levelErr = require('level').errors;
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
      const batches = this.generateBatch();
      console.log('batches to save:', batches);
    } catch (err) {
      console.warn('DataContext failed:', err.message);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  generateBatch() {
    const batch = new Array;

    for (const obj of this.objProxies.values()) {
      for (const item of obj.unsavedBatch) {
        batch.push(item);
      }
    }

    return batch;
  }

  getObjectById(_id) {
    if (this.objProxies.has(_id))
      return this.objProxies.get(_id).ready;

    const docPromise = this.database.docsLevel.get(_id);
    const obj = new ObjectProxy(this, _id, docPromise);

    this.objProxies.set(_id, obj);
    return obj.ready;
  }

  async queryGraph(query) {
    //return new ObjectProxy(this);

    if (query.subject && query.subject.constructor === ObjectProxy)
      query.subject = query.subject._id;
    if (query.object && query.object.constructor === ObjectProxy)
      query.object = query.object._id;

    const edges = await this.database.edges.get(query);
    const promises = edges.map(async raw => ({
      subject: await this.getObjectById(raw.subject),
      predicate: raw.predicate,
      object: await this.getObjectById(raw.object),
    }));
    return Promise.all(promises);
  }
}

class ObjectProxy {
  constructor(ctx, objId, docPromise) {
    let isReady = false;
    let realDoc = null;
    let rootDoc = null;

    this.ready = docPromise.then(doc => {
      console.log('TODO: use loaded doc:', doc);
      realDoc = doc;
      rootDoc = new DocProxy(this, doc);
    }, err => {
      if (err.type === 'NotFoundError') {
        console.log(`WARN: load of doc [${objId}] failed, key not found`);
      } else {
        throw err;
      }
    }).then(() => {
      isReady = true;
      return this;
    });

    Object.defineProperty(this, 'objectId', {
      enumerable: true,
      value: objId,
    });

    Object.defineProperty(this, 'doc', {
      enumerable: true,
      get() { return rootDoc; },
      set(newDoc) {
        if (!isReady) throw new Error(
          `Can't set new doc, object isn't ready`);
        if (rootDoc) throw new Error(
          `Can't set new doc, there already is one`);
        rootDoc = DocProxy.fromEmpty(this, newDoc);
      },
    });

    Object.defineProperty(this, 'unsavedBatch', {
      enumerable: false,
      get() {
        if (!isReady) throw new Error(
          `Can't generate unsavedBatch when not ready yet`);
        const batch = new Array;

        if (!realDoc && rootDoc) {
          // CREATION
          batch.push({type:'put', key:`!docs!${objId}`, value:rootDoc.asJsonable});
        }

        return batch;
      },
    });
  }
}

class DocProxy {
  constructor(dataObj, prevData) {
    const knownKeys = new Set;
    const changedKeys = new Map;

    function getKey(key) {
      if (changedKeys.has(key)) {
        return new changedKeys.get(key);
      } else {
        return prevData[key];
      }
    }

    function setKey(key, newVal) {
      const constr = newVal === null ? null : newVal.constructor;
      switch (constr) {
        case String:
        case Number:
        case Date:
        case Boolean:
          if (dataObj[key] == newVal) {
            changedKeys.delete(key);
          } else {
            changedKeys.set(key, newVal);
            knownKeys.add(key);
          }
          break;
        default:
          throw new Error(`DocProxy doesn't accept values of type ${constr} yet`);
      }
    }

    for (const key of Object.keys(prevData)) {
      knownKeys.add(key);

      Object.defineProperty(this, key, {
        enumerable: true,
        get: getKey.bind(this, key),
        set: setKey.bind(this, key),
      });
    }

    Object.defineProperty(this, 'asJsonable', {
      enumerable: false,
      get() {
        const obj = {};
        for (const key of knownKeys) {
          let value = dataObj[key];
          if (changedKeys.has(key)) {
            value = changedKeys.get(key);
          }
          obj[key] = value.asJsonable || value;
        }
        return obj;
      },
    });
  }

  // Constructs a proxy of the given data,
  // where every field is considered dirty
  static fromEmpty(dataObj, newData) {
    const dataKeys = Object.keys(newData);
    const emptyObj = {};
    for (const key of dataKeys) {
      emptyObj[key] = null;
    }

    const rootDoc = new DocProxy(dataObj, emptyObj);
    for (const key of dataKeys) {
      rootDoc[key] = newData[key];
    }

    return rootDoc;
  }
}

class ServerDatabase {
  constructor(baseLevel) {
    this.baseLevel = baseLevel;
    this.docsLevel = sub(this.baseLevel, 'docs');
    this.edgesLevel = sub(this.baseLevel, 'edges');
    this.mutex = new RunnableMutex(this.transactNow.bind(this));

    // levelgraph doesn't do promises
    const edgeGraph = levelgraph(this.edgesLevel);
    this.edges = {
      getStream: edgeGraph.getStream.bind(edgeGraph),
      putStream: edgeGraph.putStream.bind(edgeGraph),
      searchStream: edgeGraph.searchStream.bind(edgeGraph),

      get: promisify(edgeGraph.get.bind(edgeGraph)),
      put: promisify(edgeGraph.put.bind(edgeGraph)),
      search: promisify(edgeGraph.search.bind(edgeGraph)),

      generateBatch: edgeGraph.generateBatch.bind(edgeGraph),
      createQuery: edgeGraph.createQuery.bind(edgeGraph),
      nav: promisify(navWithCb.bind(edgeGraph)),
      raw: edgeGraph, // escape hatch
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
