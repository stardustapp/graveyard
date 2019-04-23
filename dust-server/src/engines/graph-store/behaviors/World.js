GraphEngine.attachBehavior('graph-store/v1-beta1', 'World', {
  // constructor: nodeType, data

  // TODO: should leverage the EdgeQuery better
  async getBuiltInEngine({engineKey, gitHash}) {
    if (!gitHash) throw new Error(
      `gitHash is required`);
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
    if (graph) return await (await this.openSubContext(graph)).getTopObject();
    return null;
  },

  async findOrCreateGraph(opts) {
    if (!opts.engineKey) throw new Error('oops2')
    const engine = await this.getBuiltInEngine(opts);
    const graph = await engine.findOrCreateGraph(opts, this);
    await this.STORES.attachGraph(graph);
    return await (await this.openSubContext(graph)).getTopObject();
  },

  async openSubContext(graph) {
    //if (!engine) throw new Error(
    //  `Didn't find a graph engine`);
    //console.log('Using graph engine', engine);

    //const allTypes = await graph.OWNS.fetchObjectList();
    //console.log('all types:', allTypes.map(x => x.Type));

    const engine = await this.graphCtx.queryGraph({
      predicate: 'OPERATES',
      object: graph,
    }).fetchSubjects().then(x => x[0]);
    if (!engine) throw new Error(
      `World failed to find Engine operating ${graph.nodeId}`)

    return new GraphSubContext(engine, graph);
  },

  /*
    getGraphsUsingEngine(engineKey) {
      return Array
        .from(this.graphs.values())
        .filter(x => x.data.engine === engineKey);
    },
  */
});

// TODO!
// class ScopedGraphContext extends GraphContext {
//   constructor(parentCtx, innerEngine) {
//     this.loadedScopes = new Map;
//   }
// }
//
//
// class GraphScope {

class GraphSubContext {
  constructor(engineObject, graphObject) {
    this.graphObject = graphObject;

    this.nodeCache = new LoaderCache(this.loadNode.bind(this));
    this.graphCtx = new GraphContext({
      engine: engineObject,
      txnSource: this.transactRaw.bind(this), // TODO: locking / mutex!
      actionSink: this.processAction.bind(this),
    });

    this.graphCtx.realCtx = this; // TODO, really!
    this.graphCtx.nodeScope = graphObject.nodeId;
    this.graphCtx.graphObject = graphObject;
    this.graphCtx.identifyNode = this.identifyNode;
    this.graphCtx.getNodeByIdentity = this.getNodeByIdentity;
  }

  async getTopObject() {
    const topObject = await this.graphObject.TopObject;
    console.log('Opening graph context with top type', topObject.Type);
    return await this.getNodeById(topObject.nodeId);
  }

  findNodeAccessor(path) {
    return this.graphCtx.findNodeAccessor(path);
  }

  // Identifiers of format `nodeScope#nodeType#nodeId`
  identifyNode(node) {
    if (!node.nodeId || !node.nodeType) throw new Error(
      `GraphSubContext#identifyNode requires a node with a nodeId`);
    if (node.nodeScope && node.nodeScope !== this.graphObject.nodeId) console.warn(
      `WARN: GraphSubContext#identifyNode got cross-scope node`);
    return `${this.graphObject.nodeId}#${node.nodeType}#${node.nodeId}`;
  }
  getNodeByIdentity(ident) {
    const parts = ident.split('#');
    if (parts.length === 2 && parts[0] === 'Object') {
      console.error('WARN: sub getNodeByIdentity given two-part ident:', ident);
      return this.getNodeById(parts[1]);
    }
    if (parts.length !== 3) throw new Error(
      `GraphSubContext can only resolve three-part identities (got ${ident})`);
    if (parts[0] === this.graphObject.nodeId)
      return this.getNodeById(parts[2]);
    throw new Error(
      `TODO: getNodeByIdentity() cross-graph: ${ident} vs ${this.nodeScope}`);
  }

  async loadNode(nodeId) {
    const node = await this.graphObject.graphCtx.getNodeById(nodeId);

    const virtType = this.graphCtx.findNodeBuilder(node.Type);
    const accessor = FieldAccessor.forType(virtType);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${node.Type}`);

    // TODO: DRY as method (duped in context.js putNode)
    const virtNode = new GraphNode(this.graphCtx, node.nodeId, node.Type, this.graphObject.nodeId);
    return accessor.mapOut({
      nodeId,
      nodeType: node.Type,
      nodeScope: this.graphObject.nodeId,
      data: node.Data,
    }, this.graphCtx, virtNode);
  }

  getNodeById(id) {
    return this.nodeCache.getOne(id);
  }

  transactRaw(mode, cb) {
    return cb(this);
  }

  async fetchEdges(query) {
    async function mapNoun(noun) {
      if (noun == null) return null;
      const [graphId, nodeType, nodeId] = noun.split('#');
      return `Object#${nodeId}`;
    }

    const {subject, predicate, object, ...extra} = query;
    return await this.graphObject.graphCtx.fetchEdges({
      subject: await mapNoun(query.subject),
      predicate: '*'+predicate, // ANY predicate
      object: await mapNoun(query.object),
      ...extra,
    });
  }

  processAction(action) {
    console.log('failing at action', action);
    throw new Error(`TODO: handle inner graph actions`);
  }
}
