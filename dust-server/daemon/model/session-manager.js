/*
  const sessions = upgradeDB.createObjectStore('sessions', {
    keyPath: 'sid',
  });
  sessions.createIndex('aid',      'aid',      { unique: false });
  sessions.createIndex('lastUsed', 'lastUsed', { unique: false });
  {
    sid: unique session ID
    aid: account the session is for
    lifetime: String, the requested lifetime
    lifetime: String, the requested lifetime
    lastUsed: Date, of last access
  }
*/

class SessionManager {
  constructor(idb, accountManager) {
    this.idb = idb;
    this.accountManager = accountManager;

    this.sessions = new LoaderCache(this
        .loadSession.bind(this));
  }

  /*async*/ getById(sid) {
    return this.sessions.getOne(sid, sid);
  }

  // Manage each session as a singleton
  // TODO: update lastUsed like once a minute
  async loadSession(sessionId) {
    const record = await this.idb
        .transaction('sessions')
        .objectStore('sessions').get(sessionId);
    if (!record)
      throw new Error(`session ID ${sessionId} is invalid`);

    const account = await this.accountManager.getById(record.aid);
    return new Session(record, account);
  }

  async create(account, {lifetime, volatile, client, appKey}) {
    console.debug('creating session for', account.address(), '-', account.record.aid, appKey);

    const record = {
      schema: 1,
      aid: account.record.aid,
      sid: Math.random().toString(16).slice(2),
      lifetime, volatile, client,
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    // Application sessions have a restricted environment
    if (appKey) {
      record.appKey = appKey;
      const {pid, mounts} = account.record.apps[appKey];
      record.pid = pid;
      record.environment = mounts;
    }

    try {
      const tx = this.idb.transaction('sessions', 'readwrite');
      await tx.objectStore('sessions').add(record);
      await tx.complete;

    } catch (err) {
      if (err.name === 'ConstraintError') {
        throw new Error(`Session ID conflict! Re-roll the dice, please.`);
      }
      throw err;
    }

    return this.getById(record.sid);
  }

  async purge(session) {
    const tx = this.idb.transaction('sessions', 'readwrite');
    await tx.objectStore('sessions').delete(session.record.sid);
    await tx.complete;

    this.sessions.delete(session.record.sid);
  }
};

// TODO:
// - 1. Build a blank Environment.
// - 2. Construct a mongodb persistance store.
// - 3. Bind the persist store into the system env.
// - 4. Install the Domain schema into the store
// - 5. Construct or locate the domain.
// 6. Expose a launch-chart API.
// 7. Support storing data for IRC.
// 8. Support executing LUA routines.
// 9. Support launching drivers.
