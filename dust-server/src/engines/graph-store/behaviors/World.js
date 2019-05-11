GraphEngine.attachBehavior('graph-store/v1-beta1', 'World', {
  // constructor: nodeType, data

  async setup() {
    this.graphBackendCache = new LoaderCache(this
      .createGraphBackend.bind(this),
      graph => graph.nodeId);

    const allGraphs = await this.STORES.fetchGraphList();
    for (const graph of allGraphs) {
      await this.graphBackendCache.get(graph);
    }
  },
  async getContextForGraph(graph) {
    const virtBackend = await this
      .graphBackendCache.get(graph);
    return virtBackend.defaultCtx;
  },

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
    console.log('Storing new engine for builtin', engineKey);
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
    return await engine.findGraph(opts);
  },

  async findOrCreateGraph(opts) {
    if (!opts.engineKey) throw new Error('oops2')
    const engine = await this.getBuiltInEngine(opts);
    return await engine.findOrCreateGraph(opts, this);
  },

  async createGraphBackend(graph) {
    //if (!engine) throw new Error(
    //  `Didn't find a graph engine`);
    //console.log('Using graph engine', engine);

    //const allTypes = await graph.OWNS.fetchObjectList();
    //console.log('all types:', allTypes.map(x => x.Type));

    console.log('creating graph-store backend')
    const engine = await this.getGraphCtx().queryGraph({
      predicate: 'OPERATES',
      object: graph,
    }).fetchSubjects().then(x => x[0]);
    //console.log('found engines', engine);
    if (!engine) throw new Error(
      `World failed to find any Engine operating ${graph.nodeId}`)

    const backend = new VirtualGraphBackend(graph, engine, this);
    backend.defaultCtx = backend.newContext();
    return backend;
  },

  /*
    getGraphsUsingEngine(engineKey) {
      return Array
        .from(this.graphs.values())
        .filter(x => x.data.engine === engineKey);
    },
  */
});


class VirtualGraphBackend extends BaseBackend {
  constructor(graphObject, engineObject, worldObject) {
    super({
      engine: engineObject,
    });

    this.graphObject = graphObject;
    this.engineObject = engineObject;
    this.worldObject = worldObject;

    this.hostGraphCtx = this.graphObject.getGraphCtx();
  }

  putNode(nodeId, type, recordData) {
    throw new Error('TODO World#putNode');
    const node = new StoreNode(this.storeId, {nodeId, type}, recordData);
    node.recordData = node.cloneData(); // extra safety
    this.nodeMap.set(node.identify(), node);
  }
  async fetchNode(nodeId) {
    // TODO: check if node is really in this graph
    //       like fetch edge Graph#world|OWNS|Object#id
    const phyNode = await this.hostGraphCtx.getNodeById(nodeId);
    //console.log('fetched', phyNode)
    if (!phyNode.Type) {
      console.log("weird phyNode", phyNode);
      throw new Error(`fetchNode() got miswired`);
    }
    const accessor = this.accessors.get(phyNode.Type);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${phyNode.Type}`);

    // TODO: DRY as method (duped in context.js putNode)
    return new StoreNode(this.storeId, {
      nodeId,
      type: phyNode.Type,
    }, phyNode.Data);
  }

  putEdge(triple, recordData) {
    throw new Error('TODO World#putEdge');
    const edge = new StoreEdge(this.storeId, triple, recordData);
    edge.recordData = edge.cloneData(); // extra safety
    this.edgeMap.set(edge.identify(), edge);
  }
  fetchEdge(specifier) {
    throw new Error('TODO World#fetchEdge');
    const key = StoreEdge.identify(specifier);
    if (this.edgeMap.has(key)) {
      return this.edgeMap.get(key).clone();
    } else {
      return null;
    }
  }
  async queryEdges(query) {
    console.log('querying', query);
    const mapNoun = async noun => {
      if (noun == null) return null;
      const [graphId, nodeType, nodeId] = noun.split('#');
      return this.hostGraphCtx.getNodeByIdentity(`Object#${nodeId}`);
    }

    const {subject, subjectType, predicate, object, objectType, ...extra} = query;
    const hostEdges = await this.hostGraphCtx.queryEdges({
      subject: await mapNoun(query.subject),
      //subjectType: 'Object',
      predicate: '*'+predicate, // ANY predicate
      object: await mapNoun(query.object),
      //objectType: 'Object',
      ...extra,
    });

    const mapNounBack = async noun => {
      const [nodeType, nodeId] = noun.split('#');
      if (nodeType !== 'Object') throw new Error(
        `SubGraphContext got edge with unexpected nodeType ${nodeType}`);
      const hostNode = await this.hostGraphCtx.getNodeById(nodeId);
      // TODO TODO: handle nodes belonging to other graphs
      //const otherGraph = await hostNode.walk_yo_on_HAS_NAME.findOneGraph();
      /*const otherGraph = await hostNode.getGraphCtx().queryEdges({
        subjectType: 'Graph',
        predicate: 'OWNS',
        object: hostNode,
      });
      console.log('otherGraph is', otherGraph);
      throw new Error('aaa')*/
      //console.log('edge mapping hostNode', hostNode);
      return [this.graphObject.nodeId, hostNode.Type, nodeId].join('#');
    }

    return Promise.all(hostEdges.map(async hostEdge => {
      const {subject, predicate, object, ...extraData} = hostEdge;
      if (!predicate.startsWith('*')) throw new Error(
        `SubGraphContext got non-ANY edge from backing context: ${predicate}`);
      return new StoreEdge(this.storeId, {
        subject: await mapNounBack(subject),
        predicate: predicate.slice(1),
        object: await mapNounBack(object),
      }, extraData);
    }))
      .then(list => list
        .filter(edge => !subjectType || edge.subject.split('#')[1] === subjectType)
        .filter(edge => !objectType || edge.object.split('#')[1] === objectType)
      );
  }

  describe() {
    return `${this.graphObject.nodeId} ${super.describe()} (host ctx #${this.hostGraphCtx.ctxId} store #${this.hostGraphCtx.storeId})`;
  }

  newContext() {
    return new VirtualGraphContext({
      graphObject: this.graphObject,
      worldObject: this.worldObject,
      storeId: this.storeId,
      engine: this.engine,
      txnSource: this.transactRaw,
    });
  }
}

class VirtualGraphContext extends GraphContext {
  constructor(opts) {
    super(opts);
    this.graphObject = opts.graphObject;
    this.worldObject = opts.worldObject;
  }

  async getTopObject() {
    const topObject = await this.graphObject.TopObject;
    console.log('Opening graph context with top type', topObject.Type);
    return await this.getNodeById(topObject.nodeId);
  }

  // Identifiers of format `nodeScope#nodeType#nodeId`
  identifyNode(node) {
    if (!node.nodeId || !node.nodeType) throw new Error(
      `GraphSubContext#identifyNode requires a node with a nodeId`);
    // if (node.nodeScope && node.nodeScope !== this.graphObject.nodeId) console.warn(
    //   `WARN: GraphSubContext#identifyNode got cross-scope node`);
    if (node.ctxId === this.ctxId)
      return `${this.graphObject.nodeId}#${node.nodeType}#${node.nodeId}`;
    const foreignCtx = GraphContext.forId(node.ctxId);
    if (foreignCtx.constructor === VirtualGraphContext) {
      // TODO: check that we're based on the same phy context
      //const foreignStore = StoreBackend.forId(foreignCtx.storeId);
      //console.log('the other store is', )
      //return `@${node.ctxId}@`+foreignCtx.identifyNode(node);
      return foreignCtx.identifyNode(node);
    }
    console.log(foreignCtx.constructor.name, 'while i am', this.constructor.name);
    throw new Error(
      `VirtualGraphContext#identifyNode can't identify cross-GraphContext nodes`);
  }
  getNodeByIdentity(ident) {
    if (ident.startsWith('@')) {
      const [ctxId, foreignIdent] = ident.slice(1).split('@');
      const foreignCtx = GraphContext.forId(parseInt(ctxId));
      return foreignCtx.getNodeByIdentity(foreignIdent);
    }
    const parts = ident.split('#');
    if (parts.length === 2 && parts[0] === 'Object') throw new Error(
      `sub getNodeByIdentity given two-part ident: ${ident}`);
      //return this.getNodeById(parts[1]);
    if (parts.length !== 3) throw new Error(
      `GraphSubContext can only resolve three-part identities (got ${ident})`);
    if (parts[0] === this.graphObject.nodeId)
      return this.getNodeById(parts[2]);

    // cross-graph nodes
    const foreignGraph = this.graphObject.getGraphCtx().getNodeById(parts[0]);
    if (foreignGraph.then) // Wait for graph to load first.
      return foreignGraph.then(() => this
        .getNodeByIdentity(ident)); // TODO: can this recurse to infinity?

    //console.log('found foreign graph', foreignGraph);
    const foreignBackend = this.worldObject.graphBackendCache.peek(foreignGraph);
    if (!foreignBackend) {
      console.log('Looked at foreign graph', foreignGraph);
      throw new Error(
        `No foreign backend found for ${ident}`);
    }
    const foreignCtx = foreignBackend.defaultCtx;
    //console.log('found foreign context', foreignCtx);
    const foreignNode = foreignCtx.getNodeById(parts[2]);
    console.log('found foreign', foreignNode.nodeType, foreignNode.nodeId);
    return foreignNode;
  }
/*
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
*/
}
