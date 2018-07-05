class AccountManager {
  constructor(idb, packageManager) {
    this.idb = idb;
    this.packageManager = packageManager;
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

  async getAllForDomain(domain) {
    // TODO: refactor once did is present and indexed
    const all = await this.idb
      .transaction('accounts')
      .objectStore('accounts')
      .getAll();
    return await Promise.all(all
      .filter(r => r.domain == domain.record.primaryFqdn)
      .map(r => this.getAccount(r.aid)));
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

    const apps = await this.packageManager.getInstalledApps(account);
    apps.forEach(app => {
      account.mountApp(app.appRec.appKey, app.package, app.appRec);
    });

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
      pids: [], // all pids which are referenced
      apps: {}, // slug -> pid
      username, domain,
      status: (username == 'dan') ? 'admin' : 'active',
      contact: {
        name: realname,
        email: email,
      },
      createdAt: moment().toISOString(),
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

  async setPassword(account, newPassword) {
    const newHash = await dcodeIO.bcrypt.hash(newPassword, 10);

    const tx = this.idb.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');

    // make the new version
    const record = await store.get(account.record.aid);
    if (newPassword.length > 0) {
      record.secretHash = newHash;
    } else {
      delete record.secretHash;
    }

    // persist it
    await store.put(record);
    await tx.complete;
    ToastNotif(`Password changed for ${account.address()}`);

    // update the inmemory version
    account.record.secretHash = record.secretHash;
  }

  async installApp(account, pkg, appKey) {
    const tx = this.idb.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');

    // make the new version
    const record = await store.get(account.record.aid);
    if (appKey in record.apps) {
      throw new Error(`Account already has "${appKey}" application`);
    }
    if (!record.pids.includes(pkg.record.pid)) {
      record.pids.push(pkg.record.pid);
      account.record.pids.push(pkg.record.pid);
    }

    const appRec = {
      pid: pkg.record.pid,
    };
    record.apps[appKey] = appRec
    account.record.apps[appKey] = appRec;

    // persist it
    await store.put(record);
    await tx.complete;
    ToastNotif(`Installed package ${pkg.record.displayName} into ${account.address()} as ${appKey}`);

    // hot-install
    account.mountApp(appKey, pkg, appRec);
  }
};
