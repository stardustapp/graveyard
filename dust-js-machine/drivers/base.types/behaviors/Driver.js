CURRENT_LOADER.attachBehavior(class Driver {
  setup({Machine, BaseDriver, TypesDriver}) {
    this.Machine = Machine;
    this.BaseDriver = BaseDriver;
    this.TypesDriver = TypesDriver;
  }

  constructFrom(rawConfig) {
    //console.log('hi', rawConfig)
    return this.TypesDriver._callLifecycle('constructFrom', rawConfig);
  }

});
