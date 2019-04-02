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
          // to get the point across
          this.predicate = 'TOP';
          this.direction = 'in';
          this.otherName = 'top';

          this.specifier = 'from';
          this.stringForm = `TOP in from 'top'`;
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

          this.specifier = (this.direction === 'in') ? 'from' : 'to';
          this.stringForm = `${predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
          break;
      }

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
            `Arbitrary relation ${this.stringForm} didn't resolve to a type.`);
          break;
      }
    }

    [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
      return [
        options.stylize('<relation builder', 'date'),
        options.stylize(this.predicate, 'name'),
        options.stylize(this.direction, 'special'),
        options.stylize(this.specifier, 'special'),
        options.stylize(`'${this.otherName}'`, 'string'),
        options.stylize('/>', 'date'),
      ].join(' ');
    }
  }

  class NodeBuilder {
    constructor(name, config) {
      this.name = name;
      this.inner = FieldType.from(config); // TODO: 'REFERS TO' relations
      this.relations = [];

      const references = new Set;
      const visited = new Set;
      function readType(type) {
        if (visited.has(type)) return;
        visited.add(type);

        switch (type.constructor) {
          case ReferenceFieldType:
            references.add(type.targetPath);
            break;
          case StructFieldType:
            for (const fieldType of type.fields.values())
              readType(fieldType);
            break;
          case AnyOfKeyedFieldType:
            for (const fieldType of type.slots.values())
              readType(fieldType);
            break;
          case BuiltinFieldType:
            // no possible reference
            break;
          case OptionalFieldType:
            readType(type.inner);
            break;
          case ListFieldType:
            readType(type.inner);
            break;
          case PendingFieldType:
            if (type.final) readType(type.final);
            break;
          default:
            console.log('WARN: skipping unknown type', type);
        }
      }
      readType(this.inner);

      for (const refType of references) {
        if (refType.constructor === Boolean) continue;
        this.relations.push(new RelationBuilder({
          predicate: 'REFERENCES', object: refType,
        }));
      }
      if (config.relations) {
        for (const relation of config.relations) {
          this.relations.push(new RelationBuilder(relation));
        }
      }
      if (this.relations.length === 0) {
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

    [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
      if (depth < 0) {
        return [
          options.stylize('<node builder', 'date'),
          options.stylize(this.name, 'special'),
          options.stylize('/>', 'date'),
        ].join(' ');
      }

      const {inspect} = require('util');
      const newOptions = Object.assign({}, options, {
        depth: options.depth === null ? null : options.depth - 1,
      });
      const body = ['inner', 'relations', 'behavior'].map(prop =>
        `  ${prop}: ${inspect(this[prop], newOptions)}`
          .replace(/\n/g, `    \n`));

      return [
        [
          options.stylize('<node builder', 'date'),
          options.stylize(`name`, 'special'),
          options.stylize(this.name, 'name'),
          options.stylize(`type`, 'special'),
          options.stylize(this.inner.name, 'name'),
          options.stylize('>', 'date'),
        ].join(' '),
        ...body,
        options.stylize('</node>', 'date'),
      ].join('\n');
    }
  }

  return GraphEngineBuilder;
}();

if (typeof module !== 'undefined') {
  module.exports = {
    GraphEngineBuilder,
  };
}
