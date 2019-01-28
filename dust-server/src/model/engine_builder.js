const GraphEngineBuilder = function() {

  const GraphEngines = new Map;

  class GraphEngineBuilder {
    constructor(key, cb) {
      this.key = key;
      this.names = new Map;

      console.group(`[${key}] Building graph engine...`);
      try {
        cb(this);
        console.log('Successfully built graph engine!', this);
      } finally {
        console.groupEnd();
      }
    }

    node(name, conf) {
      if (this.names.has(name)) throw new Error(
        `GraphEngineBuilder was already presented the name ${JSON.stringify(name)}`);
      this.names.set(name, new NodeBuilder(name, conf));
    }

    install() {
      //for (const entry in this.names.entries()) {
      //  entry.compile(this);
      //}
      new GraphEngine(this.key, this);
    }
  }

  class EnginePartBuilder {}

  class NodeBuilder extends EnginePartBuilder {
    constructor(name, config) {
      super();
      this.name = name;
      this.inner = FieldType.from(config);

      if (!['root', 'leaf', 'parent'].includes(config.treeRole)) throw new Error(
        `Tree role ${JSON.stringify(config.treeRole)} is not valid`);
      this.treeRole = config.treeRole;
    }

    compile(builder) {
      console.log('making struct', this, builder);
      throw new Error(`TODO 2`);
    }

    fromExt(data) {
      if (!this.inner.fromExt) throw new Error(
        `Part ${this.inner.constructor.name} not fromExt-capable`);
      return this.inner.fromExt(data);
    }
    setField(data, path, value) {
      if (!this.inner.setField) throw new Error(
        `Part ${this.inner.constructor.name} not setField-capable`);
      return this.inner.setField(data, path, value);
    }
  }

  return GraphEngineBuilder;
}();