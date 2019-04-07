GraphEngine.attachBehavior('graph-store/v1-beta1', 'World', class GraphStoreWorld extends GraphObject {
  // constructor: nodeType, data

  async bindRawStore(storeImpl) {
    await this.state.rawStore.transact('readwrite store setup', async dbCtx => {
      const world = await dbCtx.getNode(this);
      console.log('root entry:', world);
      //const allGraphs = await world.OPERATES.fetchGraphList();
    });
  }

  async findGraph({engine, engineKey, fields}) {
    const targetEngine = engine ? engine.engineKey : engineKey;
    const graphNode = await this.state.rawStore.transact('readonly', async dbCtx => {
      const world = await dbCtx.getNode(this);

      const allGraphs = await world.OPERATES.fetchGraphList();
      console.log('all graphs:', allGraphs);
      return allGraphs
        .filter(x => x.data.EngineKey === targetEngine)
        .find(x => Object.keys(fields)
          .every(key => x.data.Metadata[key] == fields[key]));
    });
  }

  async findOrCreateGraph(engine, {selector, fields, buildCb}) {
    await this.ready;

    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      engine,
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    const newPackage = await buildCb(engine, fields);
    if (!newPackage) throw new Error(
      `Graph builder for ${engine.engineKey} returned nothing`);

    // persist the new graph

    const graphNode = await this.state.rawStore.transact('readwrite', async dbCtx => {
      const rootNode = await dbCtx.getNodeById('top');
      const graphNode = await rootNode.OPERATES.newGraph({
        EngineKey: engine.engineKey,
        Metadata: fields,
        Origin: { BuiltIn: 'TODO' }, // TODO
      });
      await dbCtx.createObjectTree(graphNode, newPackage);
      return graphNode;
    });
    const graphId = graphNode.nodeId;
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    if (!this.graphs.has(graphId)) console.warn(
      `WARN: Graph ${graphId} wasn't loaded after creation`);
    return graphNode;
  }

  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  }
});
