class GraphContext {
  constructor({engine, txnSource, actionSink}) {
    // NOTE: this.engine is also referenced by accessors
    this.engine = engine;
    this.txnSource = txnSource;
    this.sinkAction = actionSink;
    this.loadedNodes = new Array;
    this.loadingNodes = new Map;
  }

  async flush() {
    await this.txnSource('flush context', dbCtx => {
      this.flushNodes(dbCtx);
      // TODO: flush edges
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

      const existingRefs = (await dbCtx.fetchEdges({
        subject: `${node.nodeType}#${node.nodeId}`,
        predicate: 'REFERENCES',
      })).map(x => x.object);
      console.log('existing refs', existingRefs)

      const extraRefs = new Set(existingRefs);
      //console.log('i desire refs', refs, 'for', node);
      for (const desiredObj of refs) {
        extraRefs.delete(desiredObj);
        if (!existingRefs.includes(desiredObj)) {
          console.log('Creating ref to', desiredObj);
          await node.graphCtx.newEdge({
            subject: node,
            predicate: 'REFERENCES',
            object: desiredObj,
          });
        }
      }
      for (const extra of extraRefs) {
        console.log('want to remove edge', extra);
        throw new Error(`TODO: remove reference edge`);
      }
    }
    //console.groupEnd();
    //console.debug('flushed', nodes.size, 'nodes:', Array.from(nodes));
    this.loadedNodes.length = 0;
    this.loadingNodes.clear();
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

  newEdge({subject, predicate, object}) {
    if (!subject) throw new Error(`newEdge() requires 'subject'`);
    if (!object) throw new Error(`newEdge() requires 'object'`);

    if (subject.constructor === GraphNode) {
      if (!subject.nodeId || !subject.nodeType) throw new Error(
        `newEdge() requires an ID'd subject`);
      subject = `${subject.nodeType}#${subject.nodeId}`;
    }
    if (object.constructor === GraphNode) {
      if (!object.nodeId || !object.nodeType) throw new Error(
        `newEdge() requires an ID'd object`);
      object = `${object.nodeType}#${object.nodeId}`;
    }

    return this.sinkAction({
      kind: 'put edge',
      record: {
        subject,
        predicate,
        object,
      },
    });

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
    this.txnSource = graphCtx.txnSource;
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
        .map(raw => this.graphCtx.getNodeById(raw)));
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
