const {promisify} = require('util');

class GraphStore {
  constructor(database) {
    this.database = database;

    this.runningObjs = new Map;

    //this.eventProcessors = new Array;

    // read in everything
    this.ready = database.mutex
      .submit('setup', this.start.bind(this));
  }

  /*
    const graphs = upgradeDB.createObjectStore('graphs', { keyPath: 'graphId' });
    const objects = upgradeDB.createObjectStore('objects', { keyPath: 'objectId' });
    objects.createIndex('by graph', 'graphId', { multiEntry: true });
    objects.createIndex('referenced', 'refObjIds', { multiEntry: true });
    objects.createIndex('by parent', ['parentObjId', 'name'], { unique: true });
    const records = upgradeDB.createObjectStore('records', { keyPath: ['objectId', 'recordId'] });
    records.createIndex('by path', 'path', { unique: true });
    const events = upgradeDB.createObjectStore('events', { keyPath: ['graphId', 'timestamp'] });
  */

  async start(dbCtx) {

    // seed the root node
    const root = await dbCtx.getObjectById('root');
    if (!root.doc) {
      console.log('WARN: creating root document');
      root.doc = {
        asdf: 'yup',
        version: 1,
        createdAt: new Date,
      };
    }

    const allGraphs = await dbCtx.queryGraph({
      predicate: 'ChildOf',
      object: root,
    });
    for (const graphData of allGraphs) {
      const graph = new Graph(this, graphData);
      this.graphs.set(graphData.subject, graph);

      // fetch all the objects
      const objects = await this.database.graph.get({
        predicate: 'ObjInGraph',
        object: graphData.subject,
      });

      // construct the objects
      for (const objData of objects) {
        graph.populateObject(objData);
      }

      // TODO: relink after everything is loaded
      graph.relink();
    }
    console.debug('Loaded', this.graphs.size, 'graphs containing', this.objects.size, 'objects');
  }

  // user entrypoint that either runs immediately or queues for later
  transact(mode, cb) {
    return this.database.mutex.submit(mode, cb);
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
    //for (const processor of eventProcessors) {
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
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphStore,
  };
}
