class GraphContext {
  constructor({engine, txnSource, actionSink}) {
    // NOTE: this.engine is also referenced by accessors
    this.engine = engine;
    this.txnSource = txnSource;
    this.sinkAction = actionSink;
    this.loadedNodes = new Map;
    this.allEdges = new Array;
    this.loadingNodes = new Map;
    //this.flushRefMapper = null; // On-flush custom ref rewriting, for ingests

    this.topAccessor = FieldAccessor
      .forType(engine.topType);
  }

  flush() {
    return this.txnSource('flush context', async dbCtx => {
      await this.buildNodeRefs(); // TODO: shuold be done on-reference instead
      const stats = await Promise.all([
        this.flushNodes(dbCtx),
        this.flushEdges(dbCtx),
      ]);
      console.log('Flushed GraphContext:', stats.join(', '));
      this.flushRefMapper = null;
    });
  }

  async buildNodeRefs() {
    for (const node of this.loadedNodes.values()) {
      if (!node.isDirty) continue;
      const accessor = FieldAccessor.forType(this.engine.names.get(node.nodeType));

      const refs = new Set;
      //console.log('gathering refs from', node);
      accessor.gatherRefs(node, refs);
      for (const desiredObj of refs) {
        // TODO: check if this.allEdges already has the ref edge
        await this.newEdge({
          subject: node,
          predicate: 'REFERENCES',
          object: desiredObj,
        });
      }
    }
  }

  async flushNodes(dbCtx) {
    const actions = Array
      .from(this.loadedNodes.values())
      .filter(node => node.isDirty)
      .map(({nodeId, nodeType, rawData}) => ({
        kind: 'put node',
        nodeId: nodeId,
        record: {
          nodeId: nodeId,
          data: rawData,
          nodeType: nodeType,
        }
      }));

    const promises = actions.map(this
      .sinkAction.bind(this));
    await Promise.all(promises);

    this.loadedNodes.clear();
    this.loadingNodes.clear();
    return `${actions.length} nodes`;
  }

  async flushEdges(dbCtx) {
    const actions = this.allEdges
      .filter(edge => edge.isDirty)
      .map(edge => ({
        kind: 'put edge',
        record: edge.record,
      }));

    const promises = actions.map(this
      .sinkAction.bind(this));
    await Promise.all(promises);

    this.allEdges.length = 0;
    return `${actions.length} edges`;
  }

  findNodeBuilder(path) {
    if (this.engine.names.has(path))
      return this.engine.names.get(path);
    console.log('finding type', path, 'from', this.engine);
    throw new Error('findType() TODO');
  }
  findNodeAccessor(path) {
    return FieldAccessor.forType(this
      .findNodeBuilder(path));
  }

  // Identifiers of format `nodeType#nodeId`
  identifyNode(node) {
    if (!node.nodeId || !node.nodeType) throw new Error(
      `GraphContext#identifyNode requires a node with a nodeId and nodeType`);
    if (node.nodeScope) throw new Error(
      `GraphContext#identifyNode doesn't accept nodes with nodeScope`);
    //if (node.graphCtx !== this) throw new Error(
    //  `GraphContext#identifyNode can't identify cross-context nodes`);
    return `${node.nodeType}#${node.nodeId}`;
  }
  getNodeByIdentity(ident) {
    const parts = ident.split('#');
    if (parts.length !== 2) throw new Error(
      `GraphContext can only resolve two-part identities`);
    return this.getNodeById(parts[1]);
    // TODO? check for
  }

  getNodeById(nodeId) {
    if (this.loadedNodes.has(nodeId))
      return this.loadedNodes.get(nodeId);
    return this.txnSource('get node', dbCtx =>
      dbCtx.getNodeById(nodeId, this));
  }
  // getNodeFast(nodeType, nodeId) {
  //   if (this.loadingNodes.has(nodeId))
  //     return this.loadingNodes.get(nodeId);
  //
  //   const node = new GraphNode(this, nodeId, nodeType);
  //   this.loadingNodes.set(nodeId);
  //
  //   node.ready = this.txnSource('get node fast', dbCtx =>
  //     dbCtx.loadNodeData(node));
  //   return node;
  // }

  putNode(accessor, fields, nodeId) {
    if (!accessor || accessor.constructor !== NodeAccessor) throw new Error(
      `NodeAccessor instance is required for new nodes`);

    const type = accessor.typeName;
    const node = new GraphNode(this, nodeId, type);
    const record = accessor.mapIn({nodeId, fields}, this, node);
    //node.rawData = record.data;
    //node.markDirty();
    //console.log('context put node', this.identifyNode(node))
    return accessor.mapOut(record, this, node);
  }

  newNode(accessor, fields) {
    const nodeId = randomString(3); // TODO: check for uniqueness
    console.log('assigned new nodeId', nodeId);
    return this.putNode(accessor, fields, nodeId);
  }

  // use this if there can't already be a top
  async newTopNode(fields) {
    try {
      await this.getNodeById('top');
    } catch (err) {
      if (err.status !== 404) throw new Error(
        `Tried to create a second 'top' node in GraphContext`);
    }

    const node = this.putNode(this.topAccessor, fields, 'top');
    await node.ready;
    return node;
  }

  // use this to handle existing tops
  migrateTopNode(migrateCb) {
    return this
      .getNodeById('top')
      .catch(err => {
        if (err.status === 404)
          return null;
        throw err;
      })
      .then(migrateCb)
      .then(newFields => this.getNodeById('top'));
  }

  async fetchEdges(query) {
    const edges = new Map;
    function addEdge(record) {
      const valList = [
        record.subject, record.predicate, record.object,
      ].map(encodeURI).join('|');
      edges.set(valList, record);
    }
    //console.log('querying edge records using', this.allEdges.length, 'loaded edges');

    for (const edge of this.allEdges) {
      //console.log('edge', edge)
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
      subject = this.identifyNode(subject);
    }
    if (subject.constructor !== String) throw new Error(
      `newEdge() wants a String for subject, got ${subject.constructor.name}`);

    // validate/prepare object
    if (!object) throw new Error(`newEdge() requires 'object'`);
    if (object.constructor === GraphNode) {
      object = this.identifyNode(object);
    }
    if (object.constructor !== String) throw new Error(
      `newEdge() wants a String for object, got ${object.constructor.name}`);

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
      subject: query.subject ? graphCtx.identifyNode(query.subject) : null,
      predicate: query.predicate,
      object: query.object ? graphCtx.identifyNode(query.object) : null,
    };
    //console.log('building graph query for', this.query);
  }

  async fetchAll() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    const promises = edges.map(async raw => ({
      subject: await this.graphCtx.getNodeByIdentity(raw.subject),
      predicate: raw.predicate,
      object: await this.graphCtx.getNodeByIdentity(raw.object),
    }));
    return await Promise.all(promises);
  }
  async fetchSubjects() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.subject)
      .map(id => this.graphCtx.getNodeByIdentity(id)));
  }
  async fetchObjects() {
    const edges = await this.graphCtx.fetchEdges(this.query);
    return await Promise.all(edges
      .map(raw => raw.object)
      .map(id => this.graphCtx.getNodeByIdentity(id)));
  }

  async findOneObject(filter) {
    const objects = await this.fetchObjects();
    //console.log('filtering through', objects.length, 'objects');
    for (const object of objects) {
      let isMatch = true;
      for (const key in filter) {
        //console.log(key, object[key], filter[key]);
        if (object[key] !== filter[key])
          isMatch = false;
      }
      if (isMatch) {
        //console.log('found matching', object.nodeType, object.nodeId);
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
