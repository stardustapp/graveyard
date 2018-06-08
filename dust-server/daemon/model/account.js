class Account {
  constructor(record) {
    this.env = new Environment();
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

    console.log('Opened account', this.record.aid, 'for', this.address());
  }

  address() {
    return this.record.username + '@' + this.record.domain;
  }

  async assertPassword(password) {
    const secretEnt = await this.env.getEntry('/config/password');
    const secretVal = await secretEnt.get();
    if (secretVal) {
      if (password != secretVal.StringValue) {
        ToastNotif(`Failed login attempt for ${username}${domain}`);
        throw new Error(`Invalid auth credentials`);
      }
    }
    return true;
  }

  close() {
    console.log('Closing IDB for', this.address());
    this.db.close();
    this.db = null;
  }
};
