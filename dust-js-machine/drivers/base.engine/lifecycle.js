CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildDriver(loadApi, machine) {
    const builder = this._newNamedObject('Builder', {
      Machine: machine,
      BaseDriver: this,
      EngineDriver: loadApi,
    });
    await loadApi.modelFunc.call(null, builder);
    return await builder.build();
  }

});
