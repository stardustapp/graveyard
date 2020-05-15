const Sync = require('sync');
const process = require('process');

const sleepInner = (ms, cb) => setTimeout(cb, ms);
exports.sleep = (ms) => sleepInner.sync(null, ms);

exports.runMain = (main) => {
  console.log(`==> Starting runtime...`);
  Sync(main, (err, ret) => {
    console.log();
    if (err) {
      console.log(`!!! Runtime's main thread has crashed!`);
      console.log(err);
      process.exit(1);
    } else {
      console.log(`==> Runtime's main thread has completed successfully.`);
      console.log(`    Letting nodejs loop idle.`);
      console.log();
    }
  });
};
