class BaseRawStore {
  constructor(opts) {
    console.log('creating raw store with options', Object.keys(opts));
    this.engine = opts.engine || GraphEngine.get(opts.engineKey);

    this.eventProcessors = new Array;

    this.accessors = new Map;
    for (const name of this.engine.names.values()) {
      this.accessors.set(name.name, FieldAccessor.forType(name));
    }
    //console.log('Raw store accessors:', this.accessors);

    this.topType = Array
      .from(this.engine.edges)
      .find(x => x.constructor === TopRelationBuilder)
      .topType;

    this.mutex = new RunnableMutex(this.transactNow.bind(this));

    this.rootContext = new GraphContext({
      engine: this.engine,
      txnSource: this.transact.bind(this),
      actionSink: this.processAction.bind(this),
    });
  }

  // user entrypoint that either runs immediately or queues for later
  transact(mode, cb) {
    return this.mutex.submit(mode, cb);
  }

  // mutex entrypoint that just goes for it
  async transactNow(mode, cb) {
    const dbCtx = this.createDataContext(mode);
    //const graphCtx = new GraphContext(this.engine);
    const output = await dbCtx.runCb(cb);
    await this.rootContext.flushNodes(dbCtx);
    return output;
  }

  static async newFromImpl(storeImpl, opts={}) {
    const rawStore = new storeImpl(opts);
    await rawStore.transact('newFromImpl', async dbCtx => {
      const topAccessor = FieldAccessor.forType(rawStore.topType);
      await rawStore.rootContext.putNode(topAccessor, opts.topData || {}, 'top');
    });
    return rawStore;
  }

  getTopNode() {
    return this
      .transact('readonly', dbCtx => dbCtx
        .getNodeById('top'));
  }
}

class BaseRawContext {
  constructor(graphStore, mode) {
    this.graphStore = graphStore;
    this.mode = mode;

    this.actions = new Array;
    this.graphContexts = new Set;
    this.actionProcessors = new Array;

    this.objProxies = new Map;
  }

  async runCb(cb) {
    try {
      //console.group('-', this.constructor.name, 'start:', this.mode);
      const result = await cb(this);
      this.buildActions();
      await this.flushActions();
      return result;
    } catch (err) {
      console.warn(this.constructor.name, 'failed:', err.message);
      throw err;
    } finally {
      //console.groupEnd();
    }
  }

  buildActions() {
    for (const graphCtx of this.graphContexts) {
      graphCtx.flushActions();
    }
  }

  getNode(handle) {
    if (!GraphObject.prototype.isPrototypeOf(handle)) throw new Error(
      `TODO: getNode() for non-GraphObject node ${handle.constructor.name}`);
    if (!handle.data.nodeId) throw new Error(
      `TODO: getNode() for GraphObject without an nodeId`);
    return this.getNodeById(handle.data.nodeId);
  }

  // TODO: refactor as caching loader?
  async getNodeById(nodeId) {
    if (this.objProxies.has(nodeId))
      return this.objProxies.get(nodeId);

    const record = await this.loadNodeById(nodeId); // from raw impl
    const accessor = this.graphStore.accessors.get(record.type);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${record.type}`);

    const obj = new GraphNode(this.graphStore.rootContext, nodeId, record.type);
    return accessor.mapOut({nodeId, ...record}, this.graphStore.rootContext, obj);

    if (this.objProxies.has(nodeId))
      console.warn(`WARN: objProxies load race! for`, nodeId);
    this.objProxies.set(nodeId, obj);

    obj.ready = Promise.resolve(obj);
    return obj;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    BaseRawStore,
    BaseRawContext,
  };
}
