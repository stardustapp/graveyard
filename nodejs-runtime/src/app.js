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

  // offer a skychart API endpoint
  systemEnv.mount('/open', 'function', { invoke() {

    // start a new temporary metadata environment
    const chartEnv = new Environment();
    chartEnv.mount('/owner-name', 'literal', { string: 'Test User' });
    chartEnv.mount('/owner-email', 'literal', { string: 'test@example.com' });
    chartEnv.mount('/home-domain', 'literal', { string: 'devmode.cloud' });

    // launch offers mounting the full environment as a session
    chartEnv.mount('/launch', 'function', { invoke(input) {
      console.log('launching with', input);
      return { get() { return {
        Type: 'String',
        Name: 'session-id',
        StringValue: '66666',
      }}};
    }});

    return chartEnv;
  }});

  // present the launched sessions
  systemEnv.mount('/sessions', 'bind', {
    source: {
      getEntry(path) {
        // /<sessionId>/mnt/<stuff>
        return {
          enumerate(input) {
            return {
              Name: 'enumeration',
              Type: 'Folder',
              Children: [
                {
                  Name: '',
                  Type: 'Folder',
                },
                {
                  Name: 'test',
                  Type: 'String',
                  StringValue: '123',
                },
              ]
            }
          }
        };
      },
    },
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
