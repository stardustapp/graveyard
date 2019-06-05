CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildDriver(loadApi, machine) {
    return this._newNamedObject('Driver', {
      Machine: machine,
      BaseDriver: this,
      TypesDriver: loadApi,
    });
  }

});
