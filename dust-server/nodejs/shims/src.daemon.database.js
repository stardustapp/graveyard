const fs = require('fs');
const os = require('os');
const rimraf = require('rimraf');

let db = null;
OpenSystemDatabase = async function (argv) {
  if (db) {
    console.warn('!-> system DB double-open!');
    return db;
  }

  let dbPath = null;
  if (argv.dataPath) {
    dbPath = argv.dataPath;
  } else {
    const tempDir = fs.realpathSync(os.tmpdir());
    dbPath = fs.mkdtempSync(tempDir+'/dust-data_');
    process.on('beforeExit', (code) => {
      if (!dbPath) return;
      rimraf(dbPath, {disableGlob: true}, err => {
        if (err) {
          console.error(`\r!-> Failed to clean server memory on shutdown: ${err.message}`);
          console.error(`Temporary data may still exist in`, dbPath);
        }
        dbPath = null;
      });
      console.log(`Cleaned server memory from disk.`);
    });
  }

  try {
    fs.accessSync(dbPath, fs.constants.W_OK);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('\r--> Creating new data directory', dbPath);
    } else {
      throw new Error(`Data path ${dbPath} not writable: ${err.message}`);
    }
  }

  console.log('TODO: open database', dbPath);
  db = { close: () => {} };

  //await db.put('name', 'Level');
  //console.log('name=' + await db.get('name'));

  return db;
}
