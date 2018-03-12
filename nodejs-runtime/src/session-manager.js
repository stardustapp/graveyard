const {Environment} = require('./environment');
const {StringLiteral, FolderLiteral} = require('./api-entries');

exports.SessionManager = class SessionManager {

  constructor(systemEnv) {
    this.env = systemEnv;
    this.sessions = new Map();

    // offer a skychart API endpoint
    this.env.mount('/open', 'function', {
      invoke: this.ivkOpenChart.bind(this),
    });

    // present the launched sessions
    this.env.mount('/sessions', 'bind', {
      source: {
        getEntry(path) {
          // /<sessionId>/mnt/<stuff>
          return {
            enumerate(input) {
              return new FolderLiteral('enumeration', [
                new FolderLiteral(''),
                new StringLiteral('test', '123'),
              ]);
            },
            subscribe(newChannel) { return newChannel.invoke(c => {
              c.next(new FolderLiteral('notif', [
                new StringLiteral('type', 'Added'),
                new StringLiteral('path', 'asdf'),
                new FolderLiteral('entry'),
              ]));
              c.next(new FolderLiteral('notif', [
                new StringLiteral('type', 'Added'),
                new StringLiteral('path', 'asdf/body'),
                new StringLiteral('entry', 'yup haha'),
              ]));
              c.next(new FolderLiteral('notif', [
                new StringLiteral('type', 'Added'),
                new StringLiteral('path', 'asdf/status'),
                new StringLiteral('entry', 'todo'),
              ]));
              c.next(new FolderLiteral('notif', [
                new StringLiteral('type', 'Ready'),
              ]));
            })}
          };
        },
      },
    });

  }

  ivkOpenChart(input) {
    // start a new temporary metadata environment
    const chartEnv = new Environment();
    chartEnv.mount('/owner-name', 'literal', { string: 'Test User' });
    chartEnv.mount('/owner-email', 'literal', { string: 'test@example.com' });
    chartEnv.mount('/home-domain', 'literal', { string: 'devmode.cloud' });

    // launch offers mounting the full environment as a session
    chartEnv.mount('/launch', 'function', {
      invoke: this.ivkLaunchChart.bind(this, input),
    });

    return chartEnv;
  }

  ivkLaunchChart(chart, input) {
    console.log('launching', chart, 'with', input);

    const sessionId = Math.random().toString(16).slice(2);
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision!
        Please present an offering to the entropy gods and try again.`);
    }

    // TODO: put a real environment in here
    this.sessions.set(sessionId, {});

    return { get() {
      return new StringLiteral('session-id', sessionId);
    }};
  }

};

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
