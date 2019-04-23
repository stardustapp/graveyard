class RawVolatileStore extends BaseRawStore {
  constructor(opts) {
    super(opts);

    this.nodes = new Map;
    this.edges = new Set;
  }

  processAction({kind, record}) {
    switch (kind) {

      case 'put node':
        if (!this.accessors.has(record.nodeType)) throw new Error(
          `Can't store unrecognized node type '${record.nodeType}'`);
        if (!record.nodeId) throw new Error(
          `Node ID is required when storing nodes`);
        this.nodes.set(record.nodeId, record);
        //console.log(`stored node '${record.nodeId}'`);
        break;

      case 'put edge':
        this.edges.add(record);
        //console.log(`stored ${record.predicate} edge`);
        break;

      default: throw new Error(
        `Volatile store got weird action kind '${kind}'`);
    }
    //console.debug('Volatile store processed', kind, 'event');
  }

  loadNodeById(nodeId) {
    if (this.nodes.has(nodeId)) {
      return this.nodes.get(nodeId);
    } else {
      const myErr = new Error(`Volatile store doesn't have node '${nodeId}'`);
      myErr.status = 404;
      throw myErr;
    }
  }

  fetchEdges(query) {
    const matches = new Array;
    for (const edge of this.edges) {
      if (edge.predicate !== query.predicate) continue;
      if (query.subject && edge.subject !== query.subject) continue;
      if (query.object && edge.object !== query.object) continue;
      matches.push(edge);
    }
    console.log('Volatile query matched', matches.length,
      'of', this.edges.size, 'edges');
    return matches;
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    RawVolatileStore,
  };
}
