const extensions = GraphEngine.extend('http-messages/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, opts) {
    const connAccessor = graphCtx.findNodeAccessor('Connection');
    const conn = await graphCtx.newNode(connAccessor, {
      OpenedAt: new Date,
      ...opts,
    });
    return conn;
  },

};
