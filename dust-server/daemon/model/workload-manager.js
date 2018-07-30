class WorkloadManager {
  constructor(idb, sessionManager, ownerImpls) {
    this.idb = idb;
    this.sessionManager = sessionManager;
    this.ownerImpls = ownerImpls;
    this.ownerTypes = Object.keys(ownerImpls);

    this.activeDaemons = new Map;
    this.daemonPromises = new Map;
    this.ready = this.init();
  }

  async init() {
    const self = this;

    const tx = this.idb.transaction('workloads', 'readonly');
    const typeIdx = tx.objectStore('workloads').index('type');
    await tx.objectStore('workloads')
      .index('type').openCursor(IDBKeyRange.only('daemon'))
      .then(function cursorIterate(cursor) {
        if (!cursor) return;
        self.registerDaemon(cursor.value);
        return cursor.continue().then(cursorIterate);
      });

    console.debug('Waiting for', this.daemonPromises.size, 'daemons to start');
    const daemons = await Promise.all(Array.from(this.daemonPromises.values()));
    console.debug('All daemons started.', daemons);
    return this;
  }

  async registerDaemon(record) {
    const {wid} = record;
    if (this.activeDaemons.has(wid) || this.daemonPromises.has(wid)) {
      throw new Error(`BUG: registerDaemon(${JSON.stringify(wid)}) encountered existing daemon object with that ID`);
    }

    const promise = this.startDaemon(record).then(daemon => {
      this.activeDaemons.set(wid, daemon);
      console.debug(`Successfully registered daemon`, daemon);
      return daemon;
    }, err => {
      // TODO: send to bugsnag
      console.error(`Failed to start daemon workload.`, err);
      console.debug(`Workload that didn't start:`, record, 'Moving on.');
      return err;
    });

    this.daemonPromises.set(wid, promise);
    return promise;
  }

  async startDaemon(record) {
    console.log('Starting daemon for', record);
    if (!(record.ownerType in this.ownerImpls)) {
      throw new Error(`BUG: tried to start daemon with unknown owner type ${record.ownerType}`);
    }
    const ownerManager = this.ownerImpls[record.ownerType];
    const owner = await ownerManager.getById(record[record.ownerType]);

    const session = await this.sessionManager.create(owner, {
      lifetime: 'long',
      volatile: true,
      client: `WorkloadManager daemon ${record.wid}`,
      appKey: record.appKey,
    });

    const daemon = new DaemonWorkload(record, session);
    await daemon.ready;
    this.activeDaemons.set(record.wid, daemon);
    return daemon;
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
      const daemons = await Promise.all(daemonRecs.map(w => this.startDaemon(w)));
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
        .stopDaemon(wid, 'uninstall')
        .then(() => wid, err => {
          console.error('BUG: daemon stop failed with', err);
          return err;
        })));
      console.log('Stopped', daemonWids.length, 'daemons:', outcomes);
    }

    console.log('Purge of', ownerType, ownerId, appKey, 'is complete');
  }

  async stopDaemon(wid, signal) {
    if (this.activeDaemons.has(wid)) {
      const daemon = this.activeDaemons.get(wid);
      await daemon.stop('uninstall');
      this.activeDaemons.delete(wid);

    } else if (this.daemonPromises.has(wid)) {
      const promise = this.daemonPromises.get(wid);
      try {
        console.warn('purge-pending daemon', wid, `hasn't launched yet -- waiting`);
        const daemon = await promise;
        console.log('purge-pending daemon', wid, 'launched -- stopping it now');
        await daemon.stop('uninstall');
        this.activeDaemons.delete(wid);
        this.daemonPromises.delete(wid);
        console.log('purge-pending daemon', wid, 'was cleanly stopped -- yay!');
      } catch (err) {
        console.log('purge-pending daemon', wid, 'failed to launch -- moving on');
      }

    } else {
      console.warn('not purging daemon', wid, `- it wasn't started (??)`);
    }
  }
}