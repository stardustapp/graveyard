CURRENT_LOADER.attachBehavior(class Driver {
  build({EngineDriver, GraphBuilder, EngineDeps, NodeMap, AllRelations}) {
    this.EngineDriver = EngineDriver;
    this.GraphBuilder = GraphBuilder;
    this.EngineDeps = EngineDeps;
    this.NodeMap = NodeMap;
    this.AllRelations = AllRelations;

    this.TopRelation = Array
      .from(AllRelations)
      .find(x => x.kind === 'top');
  }

  newGraph() {
    const graph = this.GraphBuilder({
      Template: this,
    });
    return graph;
  }

  async launch(topData) {
    const {topType} = this.TopRelation;
    //console.log('launching with', topData, topType);
    const graph = this.newGraph();

    const topNode = graph.createNode(topType, topData);
    await graph.settleAllNodes();
    return topNode;
  }

});
