class VolatileNode {
  constructor(type, fields) {
    this.type = type;
    this.fields = fields;
  }

  static fromGraphObject(obj) {
    if (obj.constructor !== GraphObject) throw new Error(
      `fromGraphObject only accepts GraphObjects`);
    return {
      type: obj.type.name,
      fields: JSON.parse(obj.data.toJSON()),
    };
  }
}

class RawVolatileStore extends BaseRawStore {
  constructor(engine, topData=null) {
    super(engine);

    this.nodes = new Map;
    this.edges = new Set;

    if (topData) {
      const type = Array
        .from(engine.edges)
        .find(x => x.type === 'Top')
        .topType;

      const proxyHandler = new NodeProxyHandler(type);
      const dbCtx = this.createDataContext('read top');
      const rootNode = proxyHandler.wrap(dbCtx, 'top', type.name, topData);
      const rootObj = engine.spawnObject(rootNode, type);
      this.nodes.set('top', VolatileNode.fromGraphObject(rootObj));
      this.rootNode = rootObj;
    }
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    return new VolatileDataContext(this, mode);
  }

  static open(engine, ...args) {
    return new RawVolatileStore(engine, ...args);
  }
}

class VolatileDataContext extends BaseRawContext {
  async loadNodeById(nodeId) {
    if (this.graphStore.nodes.has(nodeId)) {
      return this.graphStore.nodes.get(nodeId);
    } else {
      const myErr = new Error(`Volatile store doesn't have node '${nodeId}'`);
      myErr.status = 404;
      throw myErr;
    }
  }

  writeNode(nodeId, {type, fields}) {
    this.graphStore.nodes.set(nodeId, new VolatileNode(type, fields));
  }

  async flushActions() {
    // TODO
    console.warn('ignoring', this.actions.length, 'volatile actions');
  }

/*
  async createObjectTree(graphNode, rootNode) {}
  async createObjects(graphNode, objects) {}
*/

  createGraphQuery(query) {
    return new VolatileEdgeQuery(this, query);
  }
}

class VolatileEdgeQuery extends BaseEdgeQuery {
  /*async*/ fetchEdges() {
    const edges = new Set;
    for (const action of this.dbCtx.actions) {
      if (action.kind !== 'put edge') continue;
      if (action.record.predicate !== this.query.predicate) continue;
      if (this.query.subject && action.record.subject !== this.query.subject) continue;
      if (this.query.object && action.record.object !== this.query.object) continue;
      edges.add(action.record);
    }
    for (const edge of this.dbCtx.graphStore.edges) {
      console.log(edge, this.query);
    }
    return Array.from(edges);
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
    VolatileDataContext,
    VolatileEdgeQuery,
  };
}
