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

    this.mutex = new RunnableMutex(this.transactRawNow.bind(this));
    this.rootContext = this.newContext();
  }

  newContext() {
    return new GraphContext({
      engine: this.engine,
      txnSource: this.transactRaw.bind(this),
      actionSink: this.processAction.bind(this),
    });
  }

  // builds a graph context and runs the code within it
  // not exclusive lock, no mutex, but will flush out when you return
  async transactGraph(cb) {
    const graphCtx = this.newContext();
    const output = await cb(graphCtx);
    await graphCtx.flush();
    return output;
  }

  // raw entrypoint that either runs immediately or queues for later
  // just passes the existing store - really just a store mutex
  transactRaw(mode, cb) {
    return this.mutex.submit(mode, cb);
  }
  transactRawNow(mode, cb) {
    return cb(this);
  }

  static async newFromImpl(storeImpl, opts={}) {
    const rawStore = new storeImpl(opts);
    await rawStore.transactGraph(async graphCtx => {
      const topAccessor = FieldAccessor.forType(rawStore.topType);
      await graphCtx.putNode(topAccessor, opts.topData || {}, 'top');
    });
    return rawStore;
  }

  getTopNode() {
    return this.getNodeById('top', this.rootContext);
  }

  // getNode(handle) {
  //   if (!GraphObject.prototype.isPrototypeOf(handle)) throw new Error(
  //     `TODO: getNode() for non-GraphObject node ${handle.constructor.name}`);
  //   if (!handle.data.nodeId) throw new Error(
  //     `TODO: getNode() for GraphObject without an nodeId`);
  //   return this.getNodeById(handle.data.nodeId);
  // }

  async getNodeById(nodeId, graphCtx) {
    const record = await this.loadNodeById(nodeId); // from raw impl
    const accessor = this.accessors.get(record.type);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${record.type}`);

    const obj = new GraphNode(graphCtx, nodeId, record.type);
    return accessor.mapOut({nodeId, ...record}, graphCtx, obj);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    BaseRawStore,
  };
}
