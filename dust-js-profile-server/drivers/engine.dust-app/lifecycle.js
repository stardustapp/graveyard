CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildNew(graphCtx, opts) {
    const {pocCodec} = extensions;
    return await pocCodec.inflateFromManifest(graphCtx, opts);
  }

});
