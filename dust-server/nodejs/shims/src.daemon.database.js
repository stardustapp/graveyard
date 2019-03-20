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

class ServerDatabase {
  constructor(baseLevel) {
    this.baseLevel = baseLevel;
    this.dataLevel = sub(this.baseLevel, 'data');
    this.graphLevel = sub(this.baseLevel, 'graph');

    // create promisified levelgraph-alike
    const graph = levelgraph(this.graphLevel);
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
    };
  }

  sub(key) {
    const subLevel = sub(this.baseLevel, '-'+key);
    return new ServerDatabase(subLevel);
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
  };
}
