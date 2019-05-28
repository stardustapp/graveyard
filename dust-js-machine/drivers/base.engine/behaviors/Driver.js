CURRENT_LOADER.attachBehavior(class Driver {
  setup({EngineDriver, GraphBuilder, NodeMap, AllRelations}) {
    this.EngineDriver = EngineDriver;
    this.GraphBuilder = GraphBuilder;
    this.NodeMap = NodeMap;
    this.AllRelations = AllRelations;

    for (const node of NodeMap.values()) {
      node.structAccessor = FieldAccessor.forType(node.inner);
    }

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
