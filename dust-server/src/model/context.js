class GraphContext {
  constructor(engine) {
    this.engine = engine;
    this.actions = new Array;
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }

  flushTo(processor) {
    //rawStore.todoFlushActions(this.actions);
    for (const action of this.actions) {
      //console.log('processing graph action', action);
      processor(action);
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphContext,
  };
}
