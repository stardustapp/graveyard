class GraphContext {
  constructor({engine, txnSource, actionSink}) {
    // NOTE: this.engine is also referenced by accessors
    this.engine = engine;
    this.txnSource = txnSource;
    this.sinkAction = actionSink;
    this.loadedNodes = new Array;
    this.allEdges = new Array;
    this.loadingNodes = new Map;
  }

  flush() {
    return this.txnSource('flush context', async dbCtx => {
      await this.flushNodes(dbCtx);
      await this.flushEdges(dbCtx);
    });
  }

  async flushNodes(dbCtx) {
    //console.group('- flushing nodes');
    const nodes = new Set;
    for (const node of this.loadedNodes) {
      if (!node.isDirty) continue;

      const accessor = FieldAccessor.forType(this.engine.names.get(node.nodeType));
      const refs = new Set;
      accessor.gatherRefs(node, refs);

      const {nodeId, nodeType} = node;
      nodes.add(nodeId);
      await this.sinkAction({
        kind: 'put node',
        nodeId: node.nodeId,
        record: {
          nodeId: node.nodeId,
          data: node.rawData,
          type: node.nodeType,
        }
      });

      for (const desiredObj of refs) {
        await node.graphCtx.newEdge({
          subject: node,
          predicate: 'REFERENCES',
          object: desiredObj,
        });
      }
    }
    //console.groupEnd();
    console.debug('Flushed', nodes.size, 'nodes');
    this.loadedNodes.length = 0;
    this.loadingNodes.clear();
  }

  async flushEdges(dbCtx) {
    const promises = this.allEdges
      .filter(edge => edge.isDirty)
      .map(edge => this.sinkAction({
        kind: 'put edge',
        record: edge.record,
      }));
    await Promise.all(promises);
    console.debug('Flushed', promises.length, 'edges');
    this.allEdges.length = 0;
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }

  getNodeById(nodeId) {
    const loadedN = this.loadedNodes.find(x => x.nodeId === nodeId);
    if (loadedN) return loadedN;
    return this.txnSource('get node', dbCtx =>
      dbCtx.getNodeById(nodeId));
  }
  getNodeFast(nodeType, nodeId) {
    if (this.loadingNodes.has(nodeId))
      return this.loadingNodes.get(nodeId);

    const node = new GraphNode(this, nodeId, nodeType);
    this.loadingNodes.set(nodeId);

    node.ready = this.txnSource('get node fast', dbCtx =>
      dbCtx.loadNodeData(node));
    return node;
  }

  putNode(accessor, fields, nodeId) {
    if (!accessor || accessor.constructor !== NodeAccessor) throw new Error(
      `NodeAccessor instance is required for new nodes`);

    const type = accessor.typeName;
    const node = new GraphNode(this, nodeId, type);
    const record = accessor.mapIn({nodeId, fields}, this, node);
    //node.rawData = record.data;
    //node.markDirty();
    return accessor.mapOut(record, this, node);
  }

  newNode(accessor, fields) {
    const nodeId = randomString(3); // TODO: check for uniqueness
    console.log('assigned new nodeId', nodeId);
    return this.putNode(accessor, fields, nodeId);
  }


  async fetchEdges(query) {
    const edges = new Map;
    function addEdge(record) {
      const valList = [
        record.subject, record.predicate, record.object,
      ].map(encodeURI).join('|');
      edges.set(valList, record);
    }
    console.log('querying edge records using', this.allEdges.length, 'loaded edges');

    for (const edge of this.allEdges) {
      console.log('edge', edge)
      if (edge.record.predicate !== query.predicate) continue;
      if (query.subject && edge.record.subject !== query.subject) continue;
      if (query.object && edge.record.object !== query.object) continue;
      addEdge(edge.record);
    }

    // TODO: add edges from backing store
    const newEdges = await this
      .txnSource('query edges',
        dbCtx => dbCtx.fetchEdges(query));
    newEdges.forEach(addEdge);

    return Array.from(edges.values());
  }

  newEdge({subject, predicate, object, ...extras}) {
    // validate/prepare subject
    if (!subject) throw new Error(`newEdge() requires 'subject'`);
    if (subject.constructor === GraphNode) {
      if (!subject.nodeId || !subject.nodeType) throw new Error(
        `newEdge() requires an ID'd subject`);
      subject = `${subject.nodeType}#${subject.nodeId}`;
    }
    if (subject.constructor !== String) throw new Error(
      `newEdge() wants a string for subject, got ${subject.constructor.name}`);

    // validate/prepare object
    if (!object) throw new Error(`newEdge() requires 'object'`);
    if (object.constructor === GraphNode) {
      if (!object.nodeId || !object.nodeType) throw new Error(
        `newEdge() requires an ID'd object`);
      object = `${object.nodeType}#${object.nodeId}`;
    }
    if (object.constructor !== String) throw new Error(
      `newEdge() wants a string for object, got ${object.constructor.name}`);

    // create the edge
    this.allEdges.push({
      isDirty: true,
      record: {
        subject, predicate, object,
        ...extras,
      }});

    // TODO: support uniqueBy by adding name to index
    // TODO: support count constraints
    // TODO: look up the opposite relation for constraints
  }

  queryGraph(query) {
    return new GraphEdgeQuery(this, query);
  }
}

class GraphEdgeQuery {
  constructor(graphCtx, query) {
    this.graphCtx = graphCtx;
    this.query = {
      subject: query.subject ? `${query.subject.nodeType}#${query.subject.nodeId}` : null,
      predicate: query.predicate,
      object: query.object ? `${query.object.nodeType}#${query.object.nodeId}` : null,
    };
    console.log('building graph query for', this.query);
  }

  async fetchAll() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    const promises = edges.map(async raw => ({
      subject: await this.graphCtx.getNodeById(raw.subject.split('#')[1]),
      predicate: raw.predicate,
      object: await this.graphCtx.getNodeById(raw.object.split('#')[1]),
    }));
    return await Promise.all(promises);
  }
  async fetchSubjects() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.subject.split('#')[1])
      .map(raw => this.graphCtx.getNodeById(raw)));
  }
  async fetchObjects() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.object.split('#')[1])
      .map(raw => this.graphCtx.getNodeById(raw)));
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
