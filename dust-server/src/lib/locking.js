class RunnableMutex {
  constructor(innerFunc) {
    this.innerFunc = innerFunc;
    this.isLocked = false;
    this.waitQueue = new Array;

    this.warnInterval = setInterval(() => {
      if (this.waitQueue.length) {
        console.warn('RunnableMutex has', this.waitQueue.length, 'waiting calls');
      }
    }, 1000);
    if (this.warnInterval.unref)
      this.warnInterval.unref();
  }

  // user entrypoint that either runs immediately or queues for later
  submit(...args) {
    if (this.isLocked) {
      return new Promise((resolve, reject) => {
        this.waitQueue.push({
          args, resolve, reject,
        });
      });
    }

    try {
      this.isLocked = true;
      return this.immediateTransact(args);
    } finally {
      this.isLocked = false;
      if (this.waitQueue.length) {
        this.runWaitingTxns();
      }
    }
  }

  // model entrypoint that runs everything that's waiting
  async runWaitingTxns() {
    if (this.isLocked) throw new Error(`runWaitingTxns() ran when not actually ready to lock`);
    try {
      console.group('Processing all queued transactions');

      // process until there's nothing left
      this.isLocked = true;
      while (this.waitQueue.length) {
        const {args, resolve, reject} = this.waitQueue.shift();
        // pipe result to the original
        const txnPromise = this.immediateTransact(args);
        txnPromise.then(out.resolve, out.reject);
        await txnPromise;
      }
      this.isLocked = false;

    } finally {
      console.groupEnd();
      if (this.waitQueue.length) {
        console.warn('WARN: still had work queued after runWaitingTxns() completed');
      }
    }
  }

  async immediateTransact(args) {
    let txn;
    try {
      txn = this.innerFunc(...args);
      await txn.promise;

    } catch (err) {
      // TODO: specific Error subclass instead
      if (txn && txn.error) {
        console.warn('Database transaction failed:', txn.error);
        throw idbTx.error;
      }
      console.error('RunnableMutex transaction crash:', err.message);
      if (txn && txn.abort) {
        console.warn('Aborting transaction due to', err.name);
        txn.abort();
      }
      throw err;//new Error(`GraphTxn rolled back due to ${err.stack.split('\n')[0]}`);
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

  async processEvent(event) {
    const {timestamp, graphId, entries} = event;
    let graph = this.graphs.get(graphId);

    // TODO
    //for (const processor of listeners) {
    //  processor(graph, event);
    //}

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
  }

  async findGraph({engine, engineKey, fields}) {
    await this.ready;

    const targetEngine = engine ? engine.engineKey : engineKey;
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === targetEngine)
      .find(x => Object.keys(fields)
        .every(key => x.data.fields[key] == fields[key]));
  }

  async findOrCreateGraph(engine, {selector, fields, buildCb}) {
    await this.ready;

    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      engine,
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    const graphBuilder = await buildCb(engine, fields);
    if (!graphBuilder) throw new Error(
      `Graph builder for ${engine.engineKey} returned nothing`);

    // persist the new graph
    const graphId = await this
      .transact('readwrite', async txn => {
        //await txn.purgeGraph(appId);
        const graphId = await txn.createGraph({engine, fields});
        await txn.createObjectTree(graphId, graphBuilder.rootNode);
        return graphId;
      });
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    if (!this.graphs.has(graphId)) throw new Error(
      `Graph ${graphId} wasn't loaded after creation`);
    return this.graphs.get(graphId);
  }

  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  }

  async finish() {
    // create the necesary events
    const events = Array
      .from(this.actions.entries())
      .map(([graphId, entries]) => ({
        timestamp: this.currentDate,
        graphId, entries,
      }));
    this.actions = null;

    // record a stack trace for debugging txns
    try {
      throw new Error('finishing GraphTxn');
    } catch (err) {
      this.finishStack = err;
    }

    console.log('events:', events);
    // store the events
    const eventStore = this.txn.objectStore('events');
    const ops = events
      .filter(doc => doc.graphId) // ignore runtime global events
      .map(doc => eventStore.add(doc));

    // wait for transaction to actually commit
    await Promise.all(ops);
    await this.txn.complete;

    // pass events into the reactivity engine
    // this is a bad time to fail!
    for (const event of events) {
      try {
        await this.graphStore.processEvent(event);
      } catch (err) {
        console.error(`DESYNC: Event failed to process.`, event, err);
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RunnableMutex,
  };
}
