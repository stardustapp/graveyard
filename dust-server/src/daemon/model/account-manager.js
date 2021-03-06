AccountManager = class AccountManager {
  constructor(idb, packageManager) {
    this.idb = idb;
    this.packageManager = packageManager;

    this.accounts = new LoaderCache(this
        .loadAccount.bind(this));
  }

  // Manage each session as a singleton
  // TODO: update lastUsed like once a minute
  /*async*/ getById(aid) {
    return this.accounts.getOne(aid, aid);
  }

  async getAllForDomain(domain) {
    // TODO: refactor once did is present and indexed
    const all = await this.idb
      .transaction('accounts')
      .objectStore('accounts')
      .getAll();
    return await Promise.all(all
      .filter(r => r.did == domain.record.did)
      .map(r => this.getById(r.aid)));
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
    //ToastNotif(`Loaded account: ${account.address()}`);

    const apps = await this.packageManager.getInstalledApps(account);
    await Promise.all(apps.map(app => {
      return account.mountApp(app.appRec.appKey, app.package, app.appRec);
    }));

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

  async create({username, domainName, domainId, realname, email}, domain) {
    const record = {
      schema: 1,
      aid: Math.random().toString(16).slice(2),
      did: domainId,
      pids: [], // all pids which are referenced
      apps: {}, // slug -> pid
      username,
      domain: domainName,
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
        throw new Error(commonTags.oneLine`Account ${username} is already registered on ${domainName}.
            Try logging in if you should have access, or choose another username or domain.`);
      }
      throw err;
    }

    const account = await this.getById(record.aid);
    ToastNotif(`New account registration: ${account.address()} by ${email} - ${realname}`);

    if (domain.webEnv) {
      console.log('Hot-mounting new account', username, 'into domain', domain.record.primaryFqdn);
      domain.webEnv.bind('/~'+username, account.webEnv);
    }
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

  async installApp(account, appRec) {
    const {appKey, pid, mounts} = appRec;

    // verify all the mounts
    for (const mount of mounts) {
      if (mount.type === 'bind' && mount.source.startsWith('/')) { // TODO: verify remotes too
        const entry = await account.env.getEntry(mount.source);
        let literal;
        try {
          if (entry) literal = await entry.get();
        } catch (err) {}
        if (literal) continue;

        if (mount.createIfMissing) {
          console.log('creating', mount.source, 'for', account.address(), '-', appRec.appKey);

          const allParts = mount.source.slice(1).split('/');
          const curParts = [];
          for (const part of allParts) {
            curParts.push(part);
            const curPath = '/'+curParts.join('/');

            const curEntry = await account.env.getEntry(curPath);
            let literal;
            try {
              if (entry) literal = await curEntry.get();
            } catch (err) {}
            if (literal) continue; // exists!

            if (!curEntry || !curEntry.put)
              throw new Error('Failed to auto-create folder', curPath, `because it wasn't writable`);
            console.warn('Creating folder', curPath, 'for', account.address());
            try {
              await curEntry.put(new FolderLiteral(decodeURIComponent(part)));
            } catch (err) {
              console.error('Failed to auto-create folder', curPath, err);
              throw new Error('Failed to auto-create folder', curPath, `- just didn't work`);
            }
          }
        } else if (!mount.skipIfMissing) {
          throw new Error(`App install lists "${mount.source}" but that path wasn't found`);
        }
      }
    }

    // make the new version
    const tx = this.idb.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    const record = await store.get(account.record.aid);
    if (appKey in record.apps) {
      throw new Error(`Account already has "${appKey}" application`);
    }
    if (!record.pids.includes(pid)) {
      record.pids.push(pid);
      account.record.pids.push(pid);
    }

    record.apps[appKey] = appRec;
    account.record.apps[appKey] = appRec;

    // persist it
    await store.put(record);
    await tx.complete;

    // hot-install
    const pkg = await this.packageManager.getOne(pid);
    account.mountApp(appKey, pkg, appRec);
    ToastNotif(`Installed package ${pkg.record.displayName} into ${account.address()} as ${appKey}`);
  }

  async removeApp(account, appKey) {
    // make the new version
    const tx = this.idb.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    const record = await store.get(account.record.aid);

    const appRec = record.apps[appKey];
    if (!appRec) {
      throw new Error(`Account doesn't have "${appKey}" application`);
    }

    delete record.apps[appKey];
    delete account.record.apps[appKey];

    // persist it
    await store.put(record);
    await tx.complete;

    // hot-install
    const pkg = await this.packageManager.getOne(appRec.pid);
    account.unmountApp(appKey, pkg, appRec);
    ToastNotif(`Removed package ${pkg.record.displayName} from ${account.address()} as ${appKey}`);
  }
};
