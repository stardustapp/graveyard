GraphEngine.attachBehavior('graph-store/v1-beta1', 'World', {
  // constructor: nodeType, data

  // TODO: should leverage the EdgeQuery better
  async upsertBuiltInEngine({EngineKey, GitHash}) {
    const allEngines = await this.OPERATES.fetchEngineList();
    const engine = allEngines
      .filter(x => x.Source.BuiltIn)
      .filter(x => x.Source.BuiltIn.EngineKey === EngineKey)
      .filter(x => x.Source.BuiltIn.GitHash === GitHash)
      [0];
    if (engine) return engine;

    return await this.OPERATES.newEngine({
      Source: {
        BuiltIn: {
          GitHash: GitHash,
          EngineKey: EngineKey,
        },
      },
    });
  },

  async findGraph({engine, engineKey, fields}) {
    const targetEngine = await this.upsertBuiltInEngine({
      EngineKey: engine ? engine.engineKey : engineKey,
      GitHash: 'TODOGIT',
    });

    const allGraphs = await targetEngine.OPERATES.fetchGraphList();
    console.log('all engine graphs:', allGraphs);
    return allGraphs
      .filter(x => x.data.EngineKey === targetEngine)
      .find(x => Object.keys(fields)
        .every(key => x.data.Metadata[key] == fields[key]));
  },

  async findOrCreateGraph(engine, {selector, fields, buildCb}) {
    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      engine,
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    const tempStore = await buildCb(engine, fields);
    if (!tempStore) throw new Error(
      `Graph builder for ${engine.engineKey} returned nothing`);

    const rootNode = await this.graphCtx.getNodeById('top');
    const graphNode = await rootNode.STORES.newGraph({
      Tags: fields,
    });
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
