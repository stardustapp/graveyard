class GraphContext {
  constructor({engine, txnSource, actionSink}) {
    // NOTE: this.engine is also referenced by accessors
    this.engine = engine;
    this.txnSource = txnSource;
    this.sinkAction = actionSink;
    this.loadedNodes = new Array;
  }

  async flushNodes() {
    for (const node of this.loadedNodes) {
      if (!node.isDirty) continue;

      const {nodeId, nodeType} = node;
      //console.log('hi', node.rawData);
      await this.sinkAction({
        kind: 'put node',
        nodeId: node.nodeId,
        record: {
          nodeId: node.nodeId,
          data: node.rawData,
          type: node.nodeType,
        }
      });
    }
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
    const node = new GraphNode(this, nodeId, type);
    const record = accessor.mapIn({nodeId, fields}, this, node);
    node.rawData = record.data;
    node.markDirty();
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
    return this.sinkAction({
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
    this.query = {
      subject: query.subject ? `${query.subject.nodeType}#${query.subject.nodeId}` : null,
      predicate: query.predicate,
      object: query.object ? `${query.object.nodeType}#${query.object.nodeId}` : null,
    };
    console.log('building graph query for', this.query);
  }

  fetchAll() {
    return this.txnSource('read edges', async dbCtx => {
      const edges = await dbCtx.fetchEdges(this.query);
      const promises = edges.map(async raw => ({
        subject: await dbCtx.getNodeById(raw.subject.split('#')[1]),
        predicate: raw.predicate,
        object: await dbCtx.getNodeById(raw.object.split('#')[1]),
      }));
      return await Promise.all(promises);
    });
  }
  fetchSubjects() {
    return this.txnSource('read edge subjects', async dbCtx => {
      const edges = await dbCtx.fetchEdges(this.query);
      return await Promise.all(edges
        .map(raw => raw.subject.split('#')[1])
        .map(raw => dbCtx.getNodeById(raw)));
      });
  }
  fetchObjects() {
    return this.txnSource('read edge objects', async dbCtx => {
      const edges = await dbCtx.fetchEdges(this.query);
      return await Promise.all(edges
        .map(raw => raw.object.split('#')[1])
        .map(raw => dbCtx.getNodeById(raw)));
    });
  }

  async findOneObject(filter) {
    const objects = await this.fetchObjects();
    console.log('filtering through', objects.length, 'objects');
    for (const object of objects) {
      let isMatch = true;
      for (const key in filter) {
        //console.log(key, object[key], filter[key]);
        if (object[key] !== filter[key])
          isMatch = false;
      }
      if (isMatch) {
        console.log('found matching', object.nodeType, object.nodeId);
        return object;
      }
    }
    console.log('missed filter:', filter);
    throw new Error(`No matching edge found`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphContext,
  };
}
