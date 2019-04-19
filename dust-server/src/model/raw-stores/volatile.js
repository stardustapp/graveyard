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

  processAction({kind, record}) {
    switch (kind) {

      case 'put node':
        if (!this.accessors.has(record.type)) throw new Error(
          `Can't store unrecognized node type '${record.type}'`);
        if (!record.nodeId) throw new Error(
          `Node ID is required when storing nodes`);
        this.nodes.set(record.nodeId, record);
        console.log(`stored node '${record.nodeId}'`);
        break;

      case 'put edge':
        this.edges.add(record);
        console.log(`stored ${record.predicate} edge`);
        break;

      default: throw new Error(
        `Volatile store got weird action kind '${kind}'`);
    }
    //console.debug('Volatile store processed', kind, 'event');
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

  /*async*/ fetchEdges(query) {
    const edges = new Set;
    console.log('querying edge records from',
      this.actions.length, 'actions and',
      this.graphStore.edges.size, 'edges');

    for (const action of this.actions) {
      if (action.kind !== 'put edge') continue;
      if (action.record.predicate !== query.predicate) continue;
      if (query.subject && action.record.subject !== query.subject) continue;
      if (query.object && action.record.object !== query.object) continue;
      edges.add(action.record);
    }

    for (const edge of this.graphStore.edges) {
      if (edge.predicate !== query.predicate) continue;
      //console.log(edge);
      if (query.subject && edge.subject !== query.subject) continue;
      if (query.object && edge.object !== query.object) continue;
      edges.add(edge);
    }

    return Array.from(edges);
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
    VolatileDataContext,
  };
}
