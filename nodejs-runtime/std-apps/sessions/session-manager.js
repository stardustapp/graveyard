const {Environment} = require('starcore/environment');
const {StringLiteral, FolderLiteral} = require('starcore/api-entries');

const {Session} = require('./session');

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
        getEntry: this.getSessionsEntry.bind(this),
      },
    });
  }

  getSessionsEntry(path) {
    const slashIdx = path.indexOf('/', 1);
    if (slashIdx === -1) {
      // TODO: implement pathing to session root
      throw new Error(`Please blindly path into your session for now`);
    }

    const sessionId = path.slice(1, slashIdx);
    const subPath = path.slice(slashIdx);

    const session = this.sessions.get(sessionId);
    if (session) {
      return session.env.getEntry(subPath);
    } else {
      throw new Error(`Invalid session ID. Please relaunch your profile.`);
    }
  }

  ivkOpenChart(input) {
    if (!input || input.constructor !== StringLiteral) {
      throw new Error(`Chart name needed when opening a chart`);
    }
    const chartName = input.StringValue;

    // start a new temporary metadata environment
    const chartEnv = new Environment();
    chartEnv.mount('/chart-name', 'literal', { string: chartName });
    chartEnv.mount('/owner-name', 'literal', { string: 'Test User' });
    chartEnv.mount('/owner-email', 'literal', { string: 'test@example.com' });
    chartEnv.mount('/home-domain', 'literal', { string: 'devmode.cloud' });

    // launch offers mounting the full environment as a session
    chartEnv.mount('/launch', 'function', {
      invoke: this.ivkLaunchChart.bind(this, chartEnv),
    });

    return chartEnv;
  }

  ivkLaunchChart(chartEnv, input) {
    console.log('launching', chartEnv, 'with', input);

    const sessionId = Math.random().toString(16).slice(2);
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision!
        Please present an offering to the entropy gods and try again.`);
    }

    this.sessions.set(sessionId, new Session(this.env, chartEnv));

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
