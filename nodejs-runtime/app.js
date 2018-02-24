const utils = require('./utils');
const {NsExport} = require('./nsexport');
const {Environment} = require('./environment');

utils.runMain(() => {

  // create a blank root environment
  const systemEnv = new Environment();

  // mount the local persist store
  systemEnv.mount('/db', 'mongodb', {
    url: 'mongodb://localhost:27017',
    database: 'startest',
  });

  // TODO: install the domain schema
  const schemas = systemEnv.getEntry('/db/schemas');
  console.log('Database schemas:', schemas.enumerate());
  const domainSchema = systemEnv.getEntry('/db/schemas/domain');
  console.log('Installing domain schema:', domainSchema.put("hello"));

  // expose the entire system environment on the network
  const server = new NsExport(systemEnv);
  server.listen();

});

// TODO:
// - 1. Build a blank Environment.
// - 2. Construct a mongodb persistance store.
// - 3. Bind the persist store into the system env.
// 4. Install the Domain schema into the store
// 5. Construct or locate the domain.
// 6. Expose a launch-chart API.
// 7. Support storing data for IRC.
// 8. Support executing LUA routines.
// 9. Support launching drivers.
