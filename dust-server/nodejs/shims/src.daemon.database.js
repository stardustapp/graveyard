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

class ServerDatabase {
  constructor(db) {
    this.rawStore = db;
    this.graph = levelgraph(sub(db, 'graph'));
  }

  static async open(dataPath) {
    AsssertWritable(dataPath);
    const db = await level(dataPath);
    return new ServerDatabase(db);
  }

  close() {
    const p = this.rawStore.close();
    this.rawStore = null;
    return p;
  }
}

let db = null;
OpenSystemDatabase = async function (argv) {
  if (db) {
    console.warn('!-> system DB double-open!');
    return db;
  }

  const dbPath = argv.dataPath ||
    await EstablishTempDir();

  db = await ServerDatabase.open(dbPath);
  return db;
}

//await db.put('name', 'Level');
//console.log('name=' + await db.get('name'));
