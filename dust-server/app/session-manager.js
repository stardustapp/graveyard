class SessionManager {

  constructor(systemEnv, idb) {
    this.env = systemEnv;
    this.idb = window.coreIdb = idb;
    this.profiles = new Map();
    this.sessions = new Map();

    // lets new users sign up for a name
    this.env.mount('/register', 'function', {
      invoke: this.ivkRegisterChart.bind(this),
    });

    // offer a skychart API endpoint
    this.env.mount('/open', 'function', {
      invoke: this.ivkOpenChart.bind(this),
    });

    // present the launched sessions
    this.env.bind('/sessions', {
      getEntry: this.getSessionsEntry.bind(this),
    });
  }

  async getSessionsEntry(path) {
    const slashIdx = path.indexOf('/', 1);
    if (slashIdx === -1) {
      // TODO: implement pathing to session root
      throw new Error(`Please blindly path into your session for now`);
    }

    const sessionId = path.slice(1, slashIdx);
    const subPath = path.slice(slashIdx);

    const session = this.sessions.get(sessionId);
    if (session) {
      return await session.env.getEntry(subPath);
    } else {
      throw new Error(`Invalid session ID. Please relaunch your profile.`);
    }
  }

  async ivkRegisterChart(input) {
    if (!input || input.constructor !== FolderLiteral) {
      throw new Error(`Chart information needed when registering a chart`);
    }
    const inputObj = {};
    input.Children.forEach(({Name, Type, StringValue}) => {
      inputObj[Name] = StringValue;
    });
    console.log('register input is', inputObj);

    const chartName = inputObj['chart-name'];
    if (!chartName) {
      throw new Error(`No username (chart-name) given with register request!`);
    }
    const ownerName = inputObj['owner-name'];
    if (!ownerName) {
      throw new Error(`No realname (owner-name) given with register request!`);
    }
    const ownerEmail = inputObj['owner-email'];
    if (!ownerEmail) {
      throw new Error(`No email address (owner-email) given with register request!`);
    }

    const tx = this.idb.transaction('profiles', 'readwrite');
    const existing = await tx.objectStore('profiles').get(chartName);
    if (existing) {
      await tx.complete;
      throw new Error(`Profile already exists with that username, try logging in or choose another username`);
    }

    const profile = {
      chartName, ownerName, ownerEmail,
    };
    ToastNotif(`New user registration: ${chartName} - ${ownerName} - ${ownerEmail}`);

    await tx.objectStore('profiles').put(profile);
    await tx.complete;

    return { async get() {
      return new StringLiteral('success', 'yes');
    }};
  }

  async ivkOpenChart(input) {
    if (!input || input.constructor !== StringLiteral) {
      throw new Error(`Chart name needed when opening a chart`);
    }
    const chartName = input.StringValue;

    const profile = await this.idb.transaction('profiles').objectStore('profiles').get(chartName);
    if (!profile) {
      ToastNotif(`Client tried accessing unknown chart ${chartName}`);
      throw new Error(`Chart not found`);
    }
    console.log('found chart:', profile);

    // start a new temporary metadata environment
    const chartEnv = new Environment();
    chartEnv.mount('/chart-name', 'literal', { string: chartName });
    chartEnv.mount('/owner-name', 'literal', { string: profile.ownerName });
    chartEnv.mount('/owner-email', 'literal', { string: profile.ownerEmail });
    chartEnv.mount('/home-domain', 'literal', { string: 'devmode.cloud' });

    // launch offers mounting the full environment as a session
    chartEnv.mount('/launch', 'function', {
      invoke: this.ivkLaunchChart.bind(this, chartEnv),
    });

    return chartEnv;
  }

  async ivkLaunchChart(chartEnv, input) {
    const chartName = (await (await chartEnv.getEntry('/chart-name')).get()).StringValue;
    console.log('launching', chartName, 'with', input);

    if (!this.profiles.has(chartName)) {
      const profilePromise = Profile.open(chartName);
      this.profiles.set(chartName, profilePromise);
    }
    const profile = await this.profiles.get(chartName);
    console.log('profile opened:', profile);

    const sessionId = Math.random().toString(16).slice(2);
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ID collision!
        Please present an offering to the entropy gods and try again.`);
    }

    ToastNotif(`User ${chartName} successfully logged in`);
    this.sessions.set(sessionId, new Session(this.env, profile));

    return { async get() {
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
