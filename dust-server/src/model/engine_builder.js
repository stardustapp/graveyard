const GraphEngineBuilder = function() {

  const GraphEngines = new Map;

  class GraphEngineBuilder {
    constructor(key, cb) {
      this.key = key;
      this.names = new Map;
      this.allRelations = new Set;

      console.group(`[${key}] Building graph engine...`);
      try {
        cb(this);
        //console.log('Successfully built graph engine!', this);
      } finally {
        console.groupEnd();
      }
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

    install() {
      // also links relations
      for (const entry of this.names.values()) {
        entry.link(this);
      }

      // TODO: deduplicate relations into edges properly
      this.edges = this.allRelations;

      new GraphEngine(this);
    }
  }

  class RelationBuilder {
    constructor(config, allowedExtras=[]) {
      const {
        subject, predicate, object,
        exactly, atMost,
        uniqueBy, // TODO
        ...extras
      } = config;

      if (!predicate) throw new Error(
        `Relationship must have a 'predicate' value`);
      if (predicate.constructor !== String) throw new Error(
        `Relationship 'predicate' must be a String`);
      switch (predicate) {

        case 'TOP':
          if (object || subject) throw new Error(
            `TOP relation cannot have any explicit 'object' or 'subject'`);

          this.type = 'Top';
          break;

        default:
          if (!object && !subject) throw new Error(
            `Arbitrary relations must explicitly have either an 'object' or a 'subject'`);
          if (object && subject) throw new Error(
            `Arbitrary relations can't explicitly have both an 'object' and a 'subject'`);

          this.type = 'Arbitrary';
          this.predicate = predicate;
          this.direction = subject ? 'in' : 'out';
          this.otherName = subject || object;
          break;
      }

      const specifier = (this.direction === 'in') ? 'from' : 'to';
      this.stringForm = `${predicate} ${this.direction} ${specifier} '${this.otherName}'`;

      this.constraints = [];
      if (exactly !== undefined)
        this.constraints.push({type: 'exactly', num: exactly});
      if (atMost !== undefined)
        this.constraints.push({type: 'atMost', num: atMost});

      const extraKeys = Object
        .keys(extras)
        .filter(key => allowedExtras.includes(key));
      if (extraKeys.length) throw new Error(
        `Relation ${this.stringForm} included extra keys: ${extraKeys.join(', ')}`);
    }

    link(nodeCtx, resolver) {
      if (this.isLinked) throw new Error(
        `double linking a RelationBuilder is bad!`);
      this.isLinked = true;
      resolver.allRelations.add(this);

      switch (this.type) {
        case 'Top':
          this.topType = nodeCtx;
          break;
        case 'Arbitrary':
          this.localType = nodeCtx;
          this.otherType = resolver.resolveName(this.otherName);
          if (!this.otherType) throw new Error(
            `Arbitrary relation ${this.stringForm} didn't resolve to a type.\n${
              JSON.stringify(this, null, 2)}`);
          break;
      }
    }
  }

  class NodeBuilder {
    constructor(name, config) {
      this.name = name;
      this.inner = FieldType.from(config); // TODO: 'REFERS TO' relations
      this.relations = [];

      if (config.relations) {
        for (const relation of config.relations) {
          this.relations.push(new RelationBuilder(relation));
        }
      } else {
        console.warn(`Node ${name} has no relations, will be inaccessible`);
      }
      this.behavior = config.behavior || GraphObject;
    }

    link(resolver) {
      let worked = false;
      try {
        for (const relation of this.relations) {
          relation.link(this, resolver);
        }
        worked = true;
      } finally {
        if (!worked)
          console.error('Failed to link', this.name);
      }
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

if (typeof module !== 'undefined') {
  module.exports = {
    GraphEngineBuilder,
  };
}
