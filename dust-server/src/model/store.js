class GraphStore {
  constructor(opts={}) {
    this.opts = opts;

    // database
    this.idb = null;
    this.graphs = new Map;
    this.objects = new Map;
    // records and events are kept cold by default

    // transaction queue
    this.readyForTxn = false;
    this.waitingTxns = new Array;

    this.ready = this.start();

    // TODO
    self.gs = this;
    this.warnInterval = setInterval(() => {
      if (this.waitingTxns.length) {
        console.warn('GraphStore has', this.waitingTxns.length, 'waiting transactions');
      }
    }, 1000);
  }

  async migrateIdb(upgradeDB) {
    // this switch intentionally falls through every case.
    // it allows for each case to build on the previous.
    switch (upgradeDB.oldVersion) {
      case 0:
        const graphs = upgradeDB.createObjectStore('graphs', { keyPath: 'graphId' });
        const objects = upgradeDB.createObjectStore('objects', { keyPath: 'objectId' });
        objects.createIndex('by graph', 'graphId', { multiEntry: true });
        objects.createIndex('referenced', 'refObjIds', { multiEntry: true });
        objects.createIndex('by parent', ['parentObjId', 'name'], { unique: true });
        const records = upgradeDB.createObjectStore('records', { keyPath: ['objectId', 'recordId'] });
        const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
    }
  }

  async start() {
    console.group('GraphStore start');
    try {

      // open IDB
      const idbName = this.opts.idbName || 'graph-worker';
      this.idb = await idb.open(idbName, 1, this.migrateIdb.bind(this));
      console.debug('Opened IDB');

      // load working dataset
      const idbTx = this.idb.transaction(['graphs', 'objects']);
      const allGraphs = await idbTx.objectStore('graphs').getAll();
      for (const graphData of allGraphs) {
        const graph = new Graph(this, graphData);
        this.graphs.set(graphData.graphId, graph);

        // fetch all the objects
        const objects = await idbTx
          .objectStore('objects').index('by graph')
          .getAll(graphData.graphId);

        // construct the objects
        for (const objData of objects) {
          graph.populateObject(objData);
        }

        graph.relink();
      }
      console.debug('Loaded', this.graphs.size, 'graphs containing', this.objects.size, 'objects');

      // open up shop
      this.readyForTxn = true;
      if (this.waitingTxns.length) {
        console.debug('Processing startup transactions...');
        await this.runWaitingTxns();
      }
      console.info('GraphStore is fully initialized. :)');

    } finally {
      console.groupEnd();
    }
  }

  // user entrypoint that either runs immediately or queues for later
  async transact(mode, cb) {
    if (this.readyForTxn) {
      try {
        this.readyForTxn = false;
        return await this.immediateTransact(mode, cb);
      } finally {
        this.readyForTxn = true;
        if (this.waitingTxns.length) {
          console.warn('Scheduling transactions that queued during failed immediate transact');
          setTimeout(this.runWaitingTxns.bind(this), 0);
        }
      }
    } else {
      return new Promise((resolve, reject) => {
        this.waitingTxns.push({
          mode, cb,
          out: {resolve, reject},
        });
      });
    }
  }

  // model entrypoint that runs everything that's waiting
  async runWaitingTxns() {
    if (!this.readyForTxn) throw new Error(`runWaitingTxns() ran when not actually ready`);
    try {
      this.readyForTxn = false;
      console.group('Processing all queued transactions');

      // process until there's nothing left
      while (this.waitingTxns.length) {
        const {mode, cb, out} = this.waitingTxns.shift();

        // pipe result to the original 
        txnPromise = this.immediateTransact(mode, cb);
        txnPromise.then(out.resolve, out.reject);
        await txnPromise;
      }

    } finally {
      this.readyForTxn = true;
      console.groupEnd();
    }
  }

  async immediateTransact(mode='readonly', cb) {
    const idbTx = this.idb.transaction(['graphs', 'objects', 'records', 'events'], mode);
    console.group(`${mode} graph transaction`);

    try {
      const txn = new GraphTxn(this, idbTx, mode);
      const result = await cb(txn);
      await txn.finish();
      return result;

    } catch (err) {
      if (idbTx.error) {
        console.warn('IDB transaction failed:', idbTx.error);
        throw idbTx.error;
      }
      console.error('GraphTxn crash:', err);
      console.warn('Aborting IDB transaction due to', err.name);
      idbTx.abort();
      throw err;//new Error(`GraphTxn rolled back due to ${err.stack.split('\n')[0]}`);

    } finally {
      console.groupEnd();
    }
  }

  /*
  async close() {
    this.transact('readonly', async txn => {
      clearInterval(this.warnInterval);
      console.warn('Closing IDB');
      const shutdown = this.idb.close();
      this.idb = null;
      await shutdown;
    });
  }
  */

  processEvent({timestamp, graphId, entries}) {
    return this.immediateTransact('readonly', async txn => {
      let graph = this.graphs.get(graphId);
      for (const entry of entries) {
        switch (entry.type) {

          case 'delete everything':
            // TODO: graceful shutdown?
            this.graphs = new Map;
            this.objects = new Map;
            break;

          case 'delete graph':
            throw new Error('@#TODO DELETE GRAPH');

          case 'create graph':
            if (graph) throw new Error(
              `DESYNC: graph double create`);
            if (this.graphs.has(graphId)) throw new Error(
              `DESYNC: graph ${graphId} already registered`);
            graph = new Graph(this, entry.data);
            this.graphs.set(graphId, graph);
            break;

          //case 'update graph':
            // TODO: event specifies new 'fields' and 'version'
            //break;

          case 'create object':
            graph.populateObject(entry.data);
            break;

          default:
            console.warn('"processing"', graphId, 'event', entry.type, entry.data);
        }
      }
      if (graph) graph.relink();
    });
  }

  async findOrCreateGraph(engine, {fields, buildCb}) {
    await this.ready;

    // return an existing graph if we find it
    const existingGraph = Array
      .from(this.graphs.values())
      .find(({data}) => {
        if (data.engine !== engine.engineKey) return false;
        return Object
          .keys(fields)
          .every(key => data.fields[key] == fields[key]);
      });
    if (existingGraph) return existingGraph;

    // ok we have to make one
    console.warn('Creating new graph for', fields);
    const graphBuilder = await buildCb(engine, fields);
    console.info('Graph is built');

    // store the new graph
    const graphId = await this
      .transact('readwrite', async txn => {
        //await txn.purgeGraph(appId);
        const graphId = await txn.createGraph({engine, fields});
        await txn.createObjectTree(graphId, graphBuilder.rootNode);
        return graphId;
      });
    console.info('Created graph', graphId);

    if (!this.graphs.has(graphId)) throw new Error(
      `Graph ${graphId} wasn't loaded after creation`);
    return this.graphs.get(graphId);
  }
}
