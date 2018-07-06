const DEFAULT_PACKAGES = [
  {
    sourceUri: 'platform://editor',
    defaultKey: 'editor',
    displayName: 'Editor',
    mounts: {
      '/config': { type: 'scoped', flavor: 'config' },
      '/data': { type: 'bind', suggestion: 'account' },
    },
  },
  {
    sourceUri: 'platform://irc-client',
    defaultKey: 'irc',
    displayName: 'IRC Client',
    mounts: {
      '/config': { type: 'scoped', flavor: 'config' },
      '/persist': { type: 'scoped', flavor: 'persist' },
      //'/secret': { type: 'scoped', flavor: 'secret' },
      '/dialer': { type: 'remote', sourceUri: 'ws://modem2.devmode.cloud:29234/pub' },
    },
  },
];

class PackageManager {
  constructor(idb) {
    this.idb = idb;
    this.all = new Map();

    const tx = this.idb.transaction('packages', 'readonly');
    tx.objectStore('packages').getAll().then(async list => {
      await Promise.all(DEFAULT_PACKAGES.map(async spec => {
        const idx = list.findIndex(pkg => pkg.sourceUri === spec.sourceUri);
        if (idx === -1) {
          console.log('Installing default', spec.defaultKey, 'package');
          const pkg = await this.install(spec);
          list.push(pkg);
        } else {
          console.log('Updating default', spec.defaultKey, 'package');
          const pkg = await this.replace(list[idx].pid, spec);
          list[idx] = pkg;
        }
      }));
      // load whatever isn't loaded yet
      const packages = list.map(r =>
          r.constructor === Package ? r : new Package(r));
      await Promise.all(packages.map(p => p.ready))
      // store everything into 
      packages.forEach(pkg => {
        this.all.set(pkg.record.pid, pkg);
      });
      console.log('Loaded', list.length, 'packages');
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

  async install({sourceUri, defaultKey, displayName, mounts}) {
    const record = {
      schema: 1,
      pid: Math.random().toString(16).slice(2),
      sourceUri, defaultKey, displayName,
      createdAt: new Date(),
      mounts: mounts || {},
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

    const pkg = new Package(record);
    this.all.set(record.pid, pkg);
    return pkg;
  }

  async replace(pid, {sourceUri, defaultKey, displayName, mounts}) {
    const tx = this.idb.transaction('packages', 'readwrite');
    const store = tx.objectStore('packages');

    const existing = store.get(pid);
    if (!existing) {
      throw new Error(`BUG: Can't replace app which isn't installed`);
    }
    const record = {
      schema: 1,
      pid,
      sourceUri, defaultKey, displayName,
      createdAt: existing.createdAt,
      mounts: mounts || {},
    };

    await store.put(record);
    await tx.complete;

    const pkg = new Package(record);
    this.all.set(record.pid, pkg);
    return pkg;
  }
}