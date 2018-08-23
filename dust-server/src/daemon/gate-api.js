class GateApi {

  constructor(systemEnv, accountManager, sessionManager, domainManager) {
    this.env = systemEnv;
    this.accountManager = accountManager;
    this.sessionManager = sessionManager;
    this.domainManager = domainManager;

    this.profiles = new Map();
    this.sessions = new Map();

    // lets new users sign up for a name
    this.env.mount('/register', 'function', new PlatformApiFunction(this, 'register', {
      input: {
        domain: String,
        username: String,
        realname: String,
        email: String,
      },
      output: String,
      impl: this.registerApi,
    }));

    // easy way to create a authed session
    this.env.mount('/login', 'function', new PlatformApiFunction(this, 'login', {
      input: {
        username: String,
        domain: 'localhost',
        password: String,
        lifetime: 'volatile', // or 'persistent'
        client: String,
      },
      output: {
        'profile id': String,
        'session id': String,
        'owner name': String,
      },
      impl: this.loginApi,
    }));

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

    const session = await this.sessionManager.getById(sessionId);
    if (session) {
      return await session.env.getEntry(subPath);
    } else {
      throw new Error(`Invalid session ID. Please relaunch your profile.`);
    }
  }

  async registerApi(input) {
    const account = await this.accountManager.create(input);
    const session = await this.sessionManager.startSession(account, {
      lifetime: 'short',
      client: 'gate-api',
    });
    return session.uri;
  }

  async loginApi({username, domain, password, lifetime, volatile, client}) {
    // look up the account
    const accountId = await this.accountManager.resolveAddress(username, domain);
    if (!accountId) {
      ToastNotif(`Client tried logging in to unknown chart ${username}@${domain}`);
      throw new Error(`Invalid auth credentials`);
    }

    // load account and check access
    const account = await this.accountManager.getById(accountId);
    await account.assertPassword(password);
    console.log('launching', account);

    // vend a new session
    const session = await this.sessionManager.create(account, {
      lifetime, volatile, client,
    });
    ToastNotif(`User ${username} successfully logged in`);

    return {
      'profile id': account.record.aid,
      'session id': session.record.sid,
      'session url': session.uri,
      'owner name': account.record.contact.name,
    };
  }
};
