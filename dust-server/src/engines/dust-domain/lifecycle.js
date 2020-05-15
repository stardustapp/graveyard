const extensions = GraphEngine.extend('dust-domain/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, {Config}) {
    return await graphCtx.newTopNode(Config);
  },

};
