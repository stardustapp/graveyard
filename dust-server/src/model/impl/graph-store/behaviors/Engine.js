GraphEngine.attachBehavior('graph-store/v1-beta1', 'Engine', {

  async setup() {
    // TODO: other kinds of engines!

    const engineKey = this.Source.BuiltIn.EngineKey;
    if (!engineKey || engineKey === 'undefined') throw new Error(
      `Can't set up Engine without Source.BuiltIn.EngineKey`);

    this.realEngine = GraphEngine.get(engineKey);
    this.names = this.realEngine.names;
    this.nameBehaviors = this.realEngine.nameBehaviors;
    //console.log('engine has names', this.names.keys())
  },

  async findGraph({fields}) {
    const allGraphs = await this.OPERATES.fetchGraphList();
    console.log('all graphs in engine:', allGraphs);
    return allGraphs
      .find(x => Object.keys(fields)
        .every(key => x.Tags[key] == fields[key]));
  },

  async findOrCreateGraph({selector, fields, buildCb}, world) {

    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    let tempStore;
    const lifecycleExt = this.realEngine.extensions.lifecycle;
    if (buildCb) {
      tempStore = await buildCb(this, fields);
    } else if (lifecycleExt) {
      const buildCtx = await RawVolatileStore.new({engine: this.realEngine});
      tempStore = await lifecycleExt.buildNew(buildCtx, fields);
    }
    if (!tempStore) throw new Error(
      `Not sure how to build graph for ${engineKey}`);

    const graphNode = await this.OPERATES.newGraph({
      Tags: fields,
    });
    await world.STORES.attachGraph(graphNode);
    await graphNode.importExternalGraph(tempStore, 'top');

    const graphId = graphNode.nodeId;
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    //if (!this.graphs.has(graphId)) console.warn(
    //  `WARN: Graph ${graphId} wasn't loaded after creation`);
    return graphNode;
  },

  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  },
});
