class BaseRawStore {
  constructor(opts) {
    this.engine = opts.engine || GraphEngine.get(opts.engineKey);

    this.accessors = new Map;
    for (const name of this.engine.names.values()) {
      this.accessors.set(name.name, FieldAccessor.forType(name));
    }

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
