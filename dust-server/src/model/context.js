class GraphContext {
  constructor(dbCtx, engine=null) {
    Object.defineProperty(this, 'dbCtx', {value: dbCtx});
    this.engine = engine || dbCtx.graphStore.engine;
    this.actions = new Array;

    dbCtx.graphContexts.add(this);
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphContext,
  };
}
