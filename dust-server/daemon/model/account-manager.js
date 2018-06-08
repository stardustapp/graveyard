/*
  const accounts = upgradeDB.createObjectStore('accounts', {
    keyPath: 'aid',
  });
  accounts.createIndex('address', ['username', 'domain'], { unique: true });
*/

class AccountManager {
  constructor(idb) {
    this.idb = idb;
    this.promises = new Map;
  }

  // Manage each session as a singleton
  // TODO: update lastUsed like once a minute
  /*async*/ getAccount(accountId) {
    if (this.promises.has(accountId))
      return this.promises.get(accountId);
    const promise = this.loadAccount(accountId);
    this.promises.set(accountId, promise);
    promise.catch(err => {
      this.promises.delete(accountId);
      return err;
    });
    return promise;
  }

  async loadAccount(accountId) {
    const record = await this.idb
        .transaction('accounts')
        .objectStore('accounts')
        .get(accountId);
    if (!record)
      throw new Error(`session ID ${accountId} is invalid`);

    const account = new Account(record);
    await account.open();
    ToastNotif(`Resumed session for ${account.address()}`);
    return account;
  }

  // returns just an aid value
  // if you want to get the account, do that afterwards
  async resolveAddress(username, domain) {
    const record = await this.idb
        .transaction('accounts')
        .objectStore('accounts')
        .index('address')
        .get([username, domain]);
    if (record)
      return record.aid;
    return null;
  }

  async create({username, domain, realname, email}) {
    if (!domain.match(/(?=^.{1,254}$)(^(?:(?!\d+\.)[a-zA-Z0-9_\-]{1,63}\.?)+(?:[a-zA-Z]{2,})$)/)) {
      throw new Error(`Domain name ${JSON.stringify(domainName)} is not a valid FQDN`);
    }

    const record = {
      schema: 1,
      aid: Math.random().toString(16).slice(2),
      username, domain,
      status: (username == 'dan') ? 'admin' : 'active',
      contact: {
        name: realname,
        email: email,
      },
      createdAt: moment().toISOString(),
      apps: [],
    };

    try {
      const tx = this.idb.transaction('accounts', 'readwrite');
      await tx.objectStore('accounts').add(record);
      await tx.complete;

    } catch (err) {
      if (err.name === 'ConstraintError') {
        throw new Error(commonTags.oneLine`Account ${username} is already registered on ${domain}.
            Try logging in if you should have access, or choose another username or domain.`);
      }
      throw err;
    }

    const account = new Account(record);
    ToastNotif(`New account registration: ${account.address()} by ${email} - ${realname}`);
    return account;
  }
};
