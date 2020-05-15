CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildNew(graphCtx, opts) {
    const connAccessor = graphCtx.findNodeAccessor('Connection');
    const conn = await graphCtx.newNode(connAccessor, {
      OpenedAt: new Date,
      ...opts,
    });
    return conn;
  }

});
