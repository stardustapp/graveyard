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
    this.sessionPromises = new Map;
  }

  // Manage each session as a singleton
  // TODO: update lastUsed like once a minute
  /*async*/ getSession(sessionId) {
    if (this.sessionPromises.has(sessionId))
      return this.sessionPromises.get(sessionId);
    const promise = this.loadSession(sessionId);
    this.sessionPromises.set(sessionId, promise);
    promise.catch(err => {
      this.sessionPromises.delete(sessionId);
      console.log(`Session ${sessionId} failed to load:`, err);
    });
    return promise;
  }

  async loadSession(sessionId) {
    const record = await this.idb
        .transaction('sessions')
        .objectStore('sessions').get(sessionId);
    if (!record)
      throw new Error(`session ID ${sessionId} is invalid`);

    const account = await this.accountManager.getAccount(record.aid);
    return new Session(record, account);
  }

  async create(account, {lifetime, volatile, client}) {
    console.log('creating session for', account.address(), '-', account.aid);

    const record = {
      schema: 1,
      aid: account.record.aid,
      sid: Math.random().toString(16).slice(2),
      lifetime, volatile, client,
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    //if (!volatile)
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

    const session = new Session(record, account);
    this.sessionPromises.set(record.aid, Promise.resolve(session));
    return session;
  }
};

// TODO:
// - 1. Build a blank Environment.
// - 2. Construct a mongodb persistance store.
// - 3. Bind the persist store into the system env.
// - 4. Install the Domain schema into the store
// 5. Construct or locate the domain.
// - 6. Expose a launch-chart API.
// 7. Support storing data for IRC.
// 8. Support executing LUA routines.
// 9. Support launching drivers.
