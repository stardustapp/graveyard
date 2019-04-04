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
  constructor(engine, topData) {
    super(engine);

    this.nodes = new Map;
    this.edges = new Set;

    const rootNode = engine.spawnTop(topData);
    this.nodes.set('top', VolatileNode.fromGraphObject(rootNode));
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    return new VolatileDataContext(this, mode);
  }

  static open(...args) {
    return new RawVolatileStore(...args);
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
  }

/*
  async storeNode(node) {}
  async newNode(type, fields) {}
  async newEdge({subject, predicate, object}, origRelation) {}
  async createObjectTree(graphNode, rootNode) {}
  async createObjects(graphNode, objects) {}
  queryGraph(query) {}
*/
}

if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
  };
}
