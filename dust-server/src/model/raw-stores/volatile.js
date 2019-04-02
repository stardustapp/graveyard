class RawVolatileStore extends GraphStore {
  constructor(engine, database) {
    super(engine);
    this.database = database;
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    const dbCtx = new VolatileDataContext(this, mode);
    dbCtx.actionProcessors.push(this.processDbActions.bind(this));
    return dbCtx;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
  };
}
