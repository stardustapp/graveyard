const extensions = GraphEngine.extend('dust-app/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, opts) {
    const {pocCodec} = extensions;
    return await pocCodec.inflateFromManifest(graphCtx, opts);
  },

};
