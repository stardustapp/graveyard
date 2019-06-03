CURRENT_LOADER.attachBehavior(class Schema {
  build({Machine, BaseDriver, TypesDriver, RawConfig}) {
    this.Machine = Machine;
    this.BaseDriver = BaseDriver;
    this.TypesDriver = TypesDriver;
  }

  newGraph() {
    // const graph = this.GraphBuilder({
    //   Template: this,
    // });
    return graph;
  }

});
