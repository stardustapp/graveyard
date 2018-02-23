const utils = require('./utils');
const {Environment} = require('./environment');

utils.runMain(() => {

  const systemEnv = new Environment();

  systemEnv.mount('/mongo', 'mongodb', {
    url: 'mongodb://localhost:27017',
    database: 'startest',
  });

  const schemas = systemEnv.getEntry('/mongo/schemas');
  console.log('Mongo schemas:', schemas.enumerate());

  //console.log('Hello. Please implement me.');

});

// TODO:
// - 1. Build a blank Environment.
// 2. Construct a mongodb persistance store.
// - 3. Bind the persist store into the system env.
// 4. Install the Domain schema into the store
// 5. Construct or locate the domain.
// 6. Expose a launch-chart API.
// 7. Support storing data for IRC.
// 8. Support executing LUA routines.
// 9. Support launching drivers.
