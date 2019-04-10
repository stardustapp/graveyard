class RawVolatileStore extends BaseRawStore {
  constructor(opts) {
    super(opts);

    this.nodes = new Map;
    this.edges = new Set;
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    return new VolatileDataContext(this, mode);
  }

  static new(opts) {
    return BaseRawStore.newFromImpl(RawVolatileStore, opts);
  }

  async processAction(action) {
    const {nodeId, type, ...extras} = action;
    console.log('processing graph action', type);

    switch (type) {
      case 'put node':
        if (!this.accessors.has(action.typeName)) throw new Error(
          `Can't store unrecognized node type '${action.typeName}'`);
        if (!nodeId) throw new Error(
          `Node ID is required when storing nodes`);
        this.nodes.set(nodeId, extras);
        break;

      default: throw new Error(
        `Volatile store got weird action type '${type}'`);
    }
  }
}

class RawVolatileNode {
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

  async flushActions() {
    // TODO
    for (const action of this.actions) {
      console.warn('ignoring volatile action', action);
    }
  }

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
