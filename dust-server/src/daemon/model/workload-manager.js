WorkloadManager = class WorkloadManager {
  constructor(idb, sessionManager, ownerImpls) {
    this.idb = idb;
    this.sessionManager = sessionManager;
    this.ownerImpls = ownerImpls;
    this.ownerTypes = Object.keys(ownerImpls);

    this.allWorkers = new Array;

    this.sessions = new LoaderCache(this
        .loadSession.bind(this));
    this.runtimes = new LoaderCache(this
        .loadRuntime.bind(this));
    this.workloads = new LoaderCache(this
        .loadWorkload.bind(this));
  }

  loadSession({ownerType, ownerId, appKey}) {
    if (!(ownerType in this.ownerImpls))
      throw new Error(`BUG: tried to start session for unknown owner type ${ownerType}`);
    const ownerManager = this.ownerImpls[ownerType];

    return ownerManager.getById(ownerId).then(owner => {
      return this.sessionManager.create(owner, {
        lifetime: 'long',
        volatile: true,
        client: `WorkloadManager daemon for ${appKey}`,
        appKey: appKey,
      });
    });
  }
  getSessionFor({ownerType, ownerId, appKey}) {
    return this.sessions.getOne(
      JSON.stringify([ownerType, ownerId, appKey]),
      {ownerType, ownerId, appKey});
  }

  loadRuntime({session, implementation}) {
    const label = `${implementation}: ${session.account.address()} / ${session.record.appKey}`;
    const worker = new RuntimeWorker(implementation, label);
    this.allWorkers.push(worker);
    return worker.volley({Op: 'ping'}).then(() => worker);
  }
  getRuntimeFor({session, implementation}) {
    const {sid, appKey} = session.record;
    return this.runtimes.getOne(
      JSON.stringify([sid, appKey, implementation]),
      {session, implementation});
  }

  loadWorkload(record) {
    const {spec, ownerType, appKey} = record;
    const ownerId = record[record.ownerType];
    return this.getSessionFor({
      ownerType, ownerId, appKey,
    }).then(session =>
      this.getRuntimeFor({
        session,
        implementation: spec.runtime,
      }).then(runtime =>
        new Workload(record, session, runtime).ready));
  }
  getWorkloadFor(record) {
    return this.workloads.getOne(record.wid, record);
  }

  async boot() {
    const self = this;
    const promises = new Array;

    const tx = this.idb.transaction('workloads', 'readonly');
    const typeIdx = tx.objectStore('workloads').index('type');
    await tx.objectStore('workloads')
      .index('type').openCursor(IDBKeyRange.only('daemon'))
      .then(function cursorIterate(cursor) {
        if (!cursor) return;
        promises.push(self.getWorkloadFor(cursor.value));
        return cursor.continue().then(cursorIterate);
      });

    console.debug('Waiting for', promises.length, 'daemons to start');
    const results = await Promise.all(promises);
    console.debug('All daemons started.', results);
    return this;
  }

  async listAppWorkloads(ownerType, ownerId, appKey) {
    const self = this;

    const tx = this.idb.transaction('workloads');
    const store = tx.objectStore('workloads');
    const promises = new Array;
    await store.index(ownerType+'App')
      .openCursor(IDBKeyRange.only([ownerId, appKey]))
      .then(function cursorIterate(cursor) {
        if (!cursor) return;
        promises.push(self.getWorkloadFor(cursor.value));
        return cursor.continue().then(cursorIterate);
      });
    return Promise.all(promises);
  }

  async installAppWorkloads(ownerType, ownerId, appKey, pkg) {
    const newWorkloads = new Array;

    try {
      const tx = this.idb.transaction('workloads', 'readwrite');
      const store = tx.objectStore('workloads');

      for (const wlKey in pkg.record.workloads) {
        const workload = pkg.record.workloads[wlKey];
        const record = {
          schema: 1,
          wid: Math.random().toString(16).slice(2),

          ownerType,
          [ownerType]: ownerId,
          appKey: appKey,
          createdAt: new Date(),

          wlKey,
          spec: workload,
        };
        console.log('installing workload', record);
        await store.add(record);
        newWorkloads.push(record);
      }

      await tx.complete;
    } catch (err) {
      if (err.name === 'ConstraintError') {
        throw new Error(`Workload ID conflict! Re-roll the dice, please.`);
      }
      throw err;
    }

    // start up the daemons if any
    const daemonRecs = newWorkloads
      .filter(w => w.spec.type === 'daemon');
    if (daemonRecs.length) {
      console.log('Starting up', daemonRecs.length, 'daemons for newly installed', appKey, 'app');
      const daemons = await Promise.all(daemonRecs.map(w => this.getWorkloadFor(w)));
      console.log('Done starting new daemons :)', daemons);
    }
  }

  async purgeAppWorkloads(ownerType, ownerId, appKey) {
    console.log('Purging any workloads belonging to', ownerType, ownerId, appKey);

    const tx = this.idb.transaction('workloads', 'readwrite');
    const store = tx.objectStore('workloads');
    const daemonWids = new Array;
    store.index(ownerType+'App')
      .openCursor(IDBKeyRange.only([ownerId, appKey]))
      .then(function cursorIterate(cursor) {
        if (!cursor) return;

        const {wid, spec} = cursor.value;
        store.delete(wid);
        if (spec.type === 'daemon') {
          daemonWids.push(wid);
        }

        return cursor.continue().then(cursorIterate);
      });
    await tx.complete;

    if (daemonWids.length) {
      console.log('Found daemons', daemonWids, 'to kill for', appKey, 'uninstall');
      const outcomes = await Promise.all(daemonWids.map(wid => this
        .workloads.delete(wid, 'uninstall')
        .then(() => wid, err => {
          console.error('BUG: daemon stop failed with', err);
          return err;
        })));
      console.log('Stopped', daemonWids.length, 'daemons:', outcomes);
    }

    console.log('Purge of', ownerType, ownerId, appKey, 'is complete');
  }
}
