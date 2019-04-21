const extensions = GraphEngine.extend('dust-app/v1-beta1');
extensions.lifecycle = {

  async buildNewStore(opts) {
    const {pocCodec} = extensions;
    const {engine, manifest} = opts;

    const store = await RawVolatileStore.new({
      engine, topData: {
        DisplayName: manifest.meta.name,
        PackageKey: manifest.packageId,
        PackageType: manifest.meta.type,
        License: manifest.meta.license,
      },
    });

    await store.transactGraph(async graphCtx => {
      const package = await graphCtx.getNodeById('top');
      await pocCodec.inflateFromManifest(package, opts);
    });

    return store;
  }

};
