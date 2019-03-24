const {promisify} = require('util');

class GraphStore {
  constructor(engine, rootNode, database) {
    this.engine = engine;
    this.rootNode = rootNode;
    this.database = database;

    //this.eventProcessors = new Array;
    this.graphs = new Map;
    this.objects = new Map;

    this.typeProxies = new Map;
    for (const name of engine.names.values()) {
      this.typeProxies.set(name.name, new NodeProxyHandler(name));
    }

    // read in everything
    this.mutex = new RunnableMutex(this.transactNow.bind(this));
    this.ready = this.mutex.submit('setup', this.start.bind(this));
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

  // user entrypoint that either runs immediately or queues for later
  transact(mode, cb) {
    return this.mutex.submit(mode, cb);
  }

  // mutex entrypoint that just goes for it
  transactNow(mode, cb) {
    return new DataContext(this, mode).runCb(cb);
  }

  async start(dbCtx) {
    console.log('Starting GraphStore');

    // overwrite whatever top node, don't care

    const rootNode = await dbCtx.storeNode(this.rootNode);

    const allGraphs = await dbCtx.queryGraph({
      subject: rootNode,
      predicate: 'OPERATES',
    }).fetchAll();
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

  /*
      let appGraph = await graphStore.transact('readwrite', async dbCtx => {
        const rootNode = await dbCtx.getNode(instance);
        const graph = await rootNode
          .walkPredicateOut('OPERATES')
          .findOne(graph =>
            graph.EngineKey === 'dust-app/v1-beta1' &&
            graph.Metadata.Heritage === 'stardust-poc' &&
            graph.Metadata.ForeignKey === instance.Config.PackageKey);
*/

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

    const graphId = await this.transact('readwrite', async dbCtx => {
      const rootNode = await dbCtx.getNode(this.rootNode);
      const graphNode = await rootNode.OPERATES.newGraph({
        EngineKey: engine.engineKey,
        Metadata: fields,
        Origin: { BuiltIn: 'TODO' }, // TODO
      });
      await dbCtx.createObjectTree(graphNode, graphBuilder.rootNode);
      return graphNode;
    });
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    //if (!this.graphs.has(graphId)) console.warn(
    //  `WARN: Graph ${graphId} wasn't loaded after creation`);
    return graphId;
  }

    /*
  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  }
*/
}

class RelationAccessor {
  constructor(dbCtx, localNode, relations) {
    Object.defineProperty(this, 'dbCtx', {
      enumerable: false,
      value: dbCtx,
    });
    this.localNode = localNode;
    this.relations = relations;

    for (const relation of relations) {
      if (relation.type === 'Arbitrary') {
        Object.defineProperty(this, 'new'+relation.otherName, {
          enumerable: true,
          value: this.attachNewNode.bind(this, relation),
        });
        Object.defineProperty(this, 'attach'+relation.otherName, {
          enumerable: true,
          value: this.attachNode.bind(this, relation),
        });
        Object.defineProperty(this, 'find'+relation.otherName, {
          enumerable: true,
          value: () => { throw new Error(`TODO: find on relation`) },
        });
      } else throw new Error(
        `TODO: RelationAccessor doesn't support ${relation.type} relations`);
    }
  }

  async attachNode(relation, otherNode) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach existing nodes to non-Arbitrary relations`);

    if (relation.direction === 'out') {
      await this.dbCtx.newEdge({
        subject: this.localNode,
        predicate: relation.predicate,
        object: otherNode,
      }, relation);
    } else {
      await this.dbCtx.newEdge({
        subject: otherNode,
        predicate: relation.predicate,
        object: this.localNode,
      }, relation);
    }
  }

  async attachNewNode(relation, fields) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach new nodes to non-Arbitrary relations`);

    const other = await this.dbCtx.newNode(relation.otherType, fields);
    await this.attachNode(relation, other);
    return other;
  }
}

class NodeProxyHandler {
  constructor(type) {
    this.type = type;
    if (type.inner.name !== 'Struct') throw new Error(
      `Unsupported inner type ${type.inner.name}`);

    this.predicates = new Map;
    for (const rel of type.relations) {
      const predicate = rel.type === 'Top' ? 'TOP' : rel.predicate;
      if (!this.predicates.has(predicate))
        this.predicates.set(predicate, new Array);
      this.predicates.get(predicate).push(rel);
    }

    //for (const [key, fieldType] of type.inner.fields.entries()) {
  }
  wrap(dbCtx, nodeId, typeName, fields, isDirty=false) {
    const target = {
      nodeId,
      typeName,
      fields,
      isDirty,
    };
    Object.defineProperty(target, 'dbCtx', {
      enumerable: false,
      value: dbCtx,
    });
    dbCtx.proxyTargets.push(target);
    return new Proxy(target, this);
  }

  get(target, prop, receiver) {
    if (prop === 'then') return null;
    if (prop === 'inspect') return null;
    if (prop === 'constructor') return NodeProxyHandler;
    if (prop === '_id') return target.nodeId;
    if (prop === 'typeName') return target.typeName;
    if (prop === 'walkPredicateOut') return predicate =>
      target.dbCtx.queryGraph({subject: receiver, predicate});

    if (this.predicates.has(prop))
      return new RelationAccessor(target.dbCtx, receiver, this.predicates.get(prop));

    if (this.type.inner.fields.has(prop)) {
      const fieldType = this.type.inner.fields.get(prop);
      if (fieldType.origin === 'core') {
        return fieldType.constr(target.fields[prop]);
      }
      console.log('getting', field);
    }

    if (prop.constructor === Symbol) {
      console.warn('NodeProxyHandler GET with a SYMBOL:', prop);
      return null;
    } else {
      console.log(Object.keys(target));
      throw new Error('TODO: GET '+prop);
    }
  }
  set(target, prop, value, receiver) {
    throw new Error('TODO: SET '+prop);

    const constr = value === null ? null : value.constructor;
    switch (constr) {
      case String:
      case Number:
      case Date:
      case Boolean:
        if (dataObj[key] == value) {
          changedKeys.delete(key);
        } else {
          changedKeys.set(key, value);
          knownKeys.add(key);
        }
        break;
      default:
        throw new Error(`NodeProxyHandler doesn't accept values of type ${constr} yet`);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphStore,
    NodeProxyHandler,
  };
}
