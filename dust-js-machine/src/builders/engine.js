class GraphEngineBuilder {
  constructor(key, cb) {
    this.key = key;
    this.names = new Map;
    this.engineDeps = new Set;
    this.allRelations = new Set;
    cb(this);
  }

  needsEngine(key) {
    this.engineDeps.add(key);
  }

  node(name, conf) {
    if (this.names.has(name)) throw new Error(
      `GraphEngineBuilder was already presented the name ${JSON.stringify(name)}`);
    this.names.set(name, new NodeBuilder(name, conf));
  }

  resolveName(name) {
    if (this.names.has(name))
      return this.names.get(name);
    return null;
  }

  async build() {
    for (const engineDep of this.engineDeps) {
      await GraphEngine.load(engineDep);
    }

    // also links relations
    for (const entry of this.names.values()) {
      await entry.link(this);
    }

    // TODO: deduplicate relations into edges properly
    this.edges = this.allRelations;

    return new GraphEngine(this);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphEngineBuilder,
  };
}
