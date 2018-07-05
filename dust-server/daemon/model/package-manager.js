const DEFAULT_PACKAGES = [
  {
    sourceUri: 'platform://editor',
    defaultKey: 'editor',
    displayName: 'Editor',
  },
];

class PackageManager {
  constructor(idb) {
    this.idb = idb;

    this.getAll().then(list => {
      DEFAULT_PACKAGES.forEach(spec => {
        if (!list.find(pkg => pkg.record.sourceUri === spec.sourceUri)) {
          console.log('Installing default', spec.defaultKey, 'package');
          this.install(spec);
        } // TODO: update existing package
      });
    });
  }

  async getAll() {
    const tx = this.idb.transaction('packages', 'readonly');
    const allRecs = await tx.objectStore('packages').getAll();
    return allRecs.map(record => {
      return new Package(record);
    });
  }

  async getOne(pid) {
    const tx = this.idb.transaction('packages', 'readonly');
    const store = tx.objectStore('packages');
    return new Package(await store.get(pid));
  }

  async getAddedPackages(account) {
    const tx = this.idb.transaction('packages', 'readonly');
    const store = tx.objectStore('packages');
    return Promise.all(account.record.pids.map(pid => {
      return store.get(pid).then(record => new Package(record));
    }));
  }

  async install({sourceUri, defaultKey, displayName}) {
    const record = {
      schema: 1,
      pid: Math.random().toString(16).slice(2),
      sourceUri, defaultKey, displayName,
      createdAt: new Date(),
    };

    try {
      const tx = this.idb.transaction('packages', 'readwrite');
      await tx.objectStore('packages').add(record);
      await tx.complete;
    } catch (err) {
      if (err.name === 'ConstraintError') {
        throw new Error(`Package ID conflict! Re-roll the dice, please.`);
      }
      throw err;
    }

    return new Package(record);
  }
}