class GraphContext {
  constructor(engine, txnSource, actionSink) {
    this.engine = engine;
    this.txnSource = txnSource;
    this.sinkAction = actionSink;
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }

  getNodeById(nodeId) {
    return this.txnSource('get node', dbCtx =>
      dbCtx.getNodeById(nodeId));
  }

  putNode(accessor, fields, nodeId) {
    if (!accessor || accessor.constructor !== NodeAccessor) throw new Error(
      `NodeAccessor instance is required for new nodes`);

    const type = accessor.typeName;
    const record = accessor.mapIn({nodeId, fields}, this);
    this.sinkAction({ kind: 'put node', nodeId, record });
    return accessor.mapOut(record, this);
  }

  newNode(accessor, fields) {
    const nodeId = randomString(3); // TODO: check for uniqueness
    return this.putNode(accessor, fields, nodeId);
  }

  newEdge({subject, predicate, object}, origRelation) {
    if (!subject || !subject.nodeId || subject.constructor !== GraphNode) throw new Error(
      `newEdge() requires a valid, ID'd subject`);
    if (!object || !object.nodeId || subject.constructor !== GraphNode) throw new Error(
      `newEdge() requires a valid, ID'd object`);

    const record = {
      subject: `${subject.nodeType}#${subject.nodeId}`,
      predicate,
      object: `${object.nodeType}#${object.nodeId}`,
    };
    this.sinkAction({
      kind: 'put edge',
      record,
    });

    // TODO: support uniqueBy by adding name to index
    // TODO: support count constraints
    // TODO: look up the opposite relation for constraints
  }

  queryGraph(query) {
    return new GraphEdgeQuery(this.txnSource, query);
  }
}

class GraphEdgeQuery {
  constructor(txnSource, query) {
    this.txnSource = txnSource;
    this.query = query;
    console.log('building graph query for', query);
  }

  async fetchAll() {
    const edges = await this.fetchEdges();
    const promises = edges.map(async raw => ({
      subject: await this.dbCtx.getNodeById(raw.subject.split('#')[1]),
      predicate: raw.predicate,
      object: await this.dbCtx.getNodeById(raw.object.split('#')[1]),
    }));
    return await Promise.all(promises);
  }
  async fetchSubjects() {
    const edges = await this.fetchEdges();
    return await Promise.all(edges
      .map(raw => raw.subject.split('#')[1])
      .map(raw => this.dbCtx.getNodeById(raw)));
  }
  fetchObjects() {
    return this.txnSource('read edges', async dbCtx => {
      const edges = await dbCtx.fetchEdges();
      return await Promise.all(edges
        .map(raw => raw.object.split('#')[1])
        .map(raw => dbCtx.getNodeById(raw)));
    });
  }

  async findOne(filter) {
    const edges = await this.fetchAll();
    for (const edge of edges) {
      let isMatch = true;
      for (const key in filter) {
        if (edge.object[key] !== filter[key])
          isMatch = false;
      }
      if (isMatch) return edge.object;
    }
    throw new Error(`No matching edge found`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphContext,
  };
}
