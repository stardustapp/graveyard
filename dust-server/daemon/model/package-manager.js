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
    this.all = new Map();

    const tx = this.idb.transaction('packages', 'readonly');
    tx.objectStore('packages').getAll().then(list => {
      DEFAULT_PACKAGES.forEach(spec => {
        if (!list.find(pkg => pkg.sourceUri === spec.sourceUri)) {
          console.log('Installing default', spec.defaultKey, 'package');
          const pkg = this.install(spec);
          list.push(pkg.record);
        } // TODO: update existing package
      });
      // load them all
      const packages = list.map(r => new Package(r));
      Promise.all(packages.map(p => p.ready)).then(() => {
        packages.forEach(pkg => {
          this.all.set(pkg.record.pid, pkg);
        });
        console.log('Loaded', list.length, 'packages');
      });
    });
  }

  getAll() {
    return Array.from(this.all.values());
  }

  getOne(pid) {
    return this.all.get(pid);
  }

  async getInstalledApps(account) {
    return Object.keys(account.record.apps).map(appKey => {
      const app = account.record.apps[appKey];
      app.appKey = appKey;
      return {
        package: this.getOne(app.pid),
        appRec: app,
      };
    });
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