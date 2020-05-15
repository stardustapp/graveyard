const utils = require('./utils');
const {NsExport} = require('./nsexport');
const {Environment} = require('./environment');
const {SessionManager} = require('./session-manager');

utils.runMain(() => {

  // create a blank root environment
  const systemEnv = new Environment();

  // mount the local persist store
  systemEnv.mount('/db', 'mongodb', {
    url: 'mongodb://localhost:27017',
    database: 'startest',
  });

  // create a manager (mounts itself)
  const sessionManager = new SessionManager(systemEnv);

  // TODO: install the domain schema
  const schemas = systemEnv.getEntry('/db/schemas');
  console.log('Database schemas:', schemas.enumerate());
  const domainSchema = systemEnv.getEntry('/db/schemas/domain');
  console.log('Installing domain schema:', domainSchema.put("hello"));

  // expose the entire system environment on the network
  const server = new NsExport(systemEnv);
  server.listen();

});
