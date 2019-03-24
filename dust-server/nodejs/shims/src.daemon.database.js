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

function wrapLevelGraph(db) {
  function navWithCb(startAt, setupCb, cb) {
    setupCb(this.nav(startAt), cb);
  }

  const lg = levelgraph(db);
  return {
    getStream: lg.getStream.bind(lg),
    putStream: lg.putStream.bind(lg),
    delStream: lg.delStream.bind(lg),
    searchStream: lg.searchStream.bind(lg),

    get: promisify(lg.get.bind(lg)),
    put: promisify(lg.put.bind(lg)),
    del: promisify(lg.del.bind(lg)),
    search: promisify(lg.search.bind(lg)),

    generateBatch: lg.generateBatch.bind(lg),
    createQuery: lg.createQuery.bind(lg),
    nav: promisify(navWithCb.bind(lg)),
    raw: lg, // escape hatch
  }
}

class ServerDatabase {
  constructor(rawLevel) {
    this.rawLevel = rawLevel;
    this.rawGraph = wrapLevelGraph(rawLevel);
  }

  static async open(persistPath) {
    const dataPath = persistPath || await EstablishTempDir();
    AsssertWritable(dataPath);

    const levelDb = await level(dataPath);
    const serverDb = new ServerDatabase(levelDb);

    console.log('Opened LevelUP database in', dataPath);
    return serverDb;
  }
}

//await db.put('name', 'Level');
//console.log('name=' + await db.get('name'));

if (typeof module !== 'undefined') {
  module.exports = {
    ServerDatabase,
  };
}
