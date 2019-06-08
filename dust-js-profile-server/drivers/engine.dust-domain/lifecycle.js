CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildNew(graphCtx, {Config}) {
    return await graphCtx.newTopNode(Config);
  }

});
