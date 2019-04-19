GraphEngine.attachBehavior('graph-store/v1-beta1', 'World', {
  // constructor: nodeType, data

  // TODO: should leverage the EdgeQuery better
  async getBuiltInEngine({engineKey, gitHash}) {
    const allEngines = await this.OPERATES.fetchEngineList();
    const engine = allEngines
      .filter(x => x.Source.BuiltIn)
      .filter(x => x.Source.BuiltIn.EngineKey === engineKey)
      //.filter(x => x.Source.BuiltIn.GitHash === gitHash)
      [0];

    if (engine) {
      // update the found engine if necesary
      if (engine.Source.BuiltIn.GitHash !== gitHash) {
        engine.Source.BuiltIn.GitHash = gitHash;
      }

      return engine;
    }

    // make fresh engine, none found
    return await this.OPERATES.newEngine({
      Source: {
        BuiltIn: {
          GitHash: gitHash,
          EngineKey: engineKey,
        },
      },
    });
  },

  async findGraph(opts) {
    if (!opts.engineKey) throw new Error('oops1')
    const engine = await this.getBuiltInEngine(opts);
    const graph = await engine.findGraph(opts);
    if (graph) return this.openSubContext(graph);
    return null;
  },

  async findOrCreateGraph(opts) {
    if (!opts.engineKey) throw new Error('oops2')
    const engine = await this.getBuiltInEngine(opts);
    const graph = await engine.findOrCreateGraph(opts, this);
    return this.openSubContext(graph);
  },

  async openSubContext(graph) {
    const topObject = await graph.TopObject.fetch();
    console.log('Opening graph context with top type', topObject.Type);

    //if (!engine) throw new Error(
    //  `Didn't find a graph engine`);
    //console.log('Using graph engine', engine);

    //const allTypes = await graph.OWNS.fetchObjectList();
    //console.log('all types:', allTypes.map(x => x.Type));

    const engine = await this.graphCtx.queryGraph({
      predicate: 'OPERATES',
      object: graph,
    }).fetchSubjects().then(x => x[0]);

    const subCtx = new GraphSubContext(engine, graph);
    return subCtx.getNodeById(topObject.nodeId);
  },

  /*
    getGraphsUsingEngine(engineKey) {
      return Array
        .from(this.graphs.values())
        .filter(x => x.data.engine === engineKey);
    },
  */
});

class GraphSubContext {
  constructor(engineObject, graphObject) {
    this.graphObject = graphObject;

    this.nodeCache = new LoaderCache(this.loadNode.bind(this));
    this.graphCtx = new GraphContext({
      engine: engineObject,
      txnSource: this.transact.bind(this),
      actionSink: this.processAction.bind(this),
    });
  }

  async loadNode(nodeId) {
    const node = await this.graphObject.graphCtx.getNodeById(nodeId);
    const virtType = this.graphCtx.findNodeBuilder(node.Type);
    const accessor = FieldAccessor.forType(virtType);
    console.log('found accessor', accessor, 'for type', node.Type)
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${node.Type}`);

    return accessor.mapOut({
      nodeId,
      type: node.Type,
      data: node.Data,
    }, this.graphCtx);
  }

  getNodeById(id) {
    return this.nodeCache.getOne(id);
  }

  async transact(mode, cb) {
    console.log('heh a');
    try {
      return await cb(this);
    } finally {
      console.log('done heh');
    }
    //throw new Error(`TODO: graph transact`);
  }

  processAction(action) {
    console.log('failing at action', action);
    throw new Error(`TODO: handle inner graph actions`);
  }
}
