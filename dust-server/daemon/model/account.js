class Account {
  constructor(record) {
    this.env = new Environment();
    this.webEnv = new Environment();
    this.record = record;
  }

  async open() {
    this.db = await idb.open('account:'+this.record.aid, 1, upgradeDB => {
      switch (upgradeDB.oldVersion) {
        case 0:
          upgradeDB.createObjectStore('persist', {
            keyPath: 'nid',
          });
          upgradeDB.createObjectStore('config', {
            keyPath: 'nid',
          });
      }
    });

    await this.env.mount('/config', 'idb-treestore', { db: this.db, store: 'config' });
    await this.env.mount('/persist', 'idb-treestore', { db: this.db, store: 'persist' });
    await this.env.mount('/chart-name', 'literal', { string: this.address() });

    console.debug('Opened account', this.record.aid, 'for', this.address());
  }

  address() {
    return this.record.username + '@' + this.record.domain;
  }

  hasPassword() {
    return !!this.record.secretHash;
  }

  async assertPassword(password) {
    //const secretEnt = await this.env.getEntry('/config/password');
    //const secretVal = await secretEnt.get();
    
    const {secretHash} = this.record;
    if (!secretHash) {
      throw new Error(`This account doesn't have a password and cannot be logged into`);
    }

    if (secretHash.startsWith('$2a$')) {
      // bcrypt
      const ok = await dcodeIO.bcrypt.compare(password, secretHash);
      if (!ok) {
        ToastNotif(`Failed login attempt for ${this.address()}`);
        throw new Error(`Invalid auth credentials`);
      }
      return ok;
    }
    
    throw new Error(`BUG: Account has an unrecognized hashing strategy. Find your system administrator`);
  }

  async mountApp(appKey, pkg, appRec) {
    await pkg.ready;
    this.webEnv.bind('/'+appKey, pkg.webroot);
  }

  unmountApp(appKey, pkg, appRec) {
    this.webEnv.devices.delete('/'+appKey);
  }

  close() {
    console.log('Closing IDB for', this.address());
    this.db.close();
    this.db = null;
  }
};
