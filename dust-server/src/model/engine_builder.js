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

  install() {
    const promise = this.build();
    GraphEngine.setEngine(this.key, promise);
    return promise;
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

class RelationBuilder {
  constructor(constraints) {
    this.constraints = constraints;
  }

  static forConfig(config, allowedExtras=[]) {
    try {
      const {
        kind, subject, predicate, object, engineKey,
        exactly, atMost, uniqueBy,
        ...extras
      } = config;

      const extraKeys = Object
        .keys(extras)
        .filter(key => allowedExtras.includes(key));
      if (extraKeys.length) throw new Error(
        `RelationBuilder received extra keys: ${extraKeys.join(', ')}`);

      const constraints = [];
      if (exactly !== undefined)
        constraints.push({type: 'exactly', num: exactly});
      if (atMost !== undefined)
        constraints.push({type: 'atMost', num: atMost});
      if (uniqueBy !== undefined)
        constraints.push({type: 'uniqueBy', path: uniqueBy});

      switch (kind || (predicate ? 'arbitrary' : null)) {
        case 'arbitrary':
          return new ArbitraryRelationBuilder(constraints, subject, predicate, object, engineKey);
        case 'top':
          if (object || predicate || subject) throw new Error(
            `'top' relation cannot have any explicit 'object' or 'predicate' or 'subject'`);
          return new TopRelationBuilder(constraints);
        case 'any':
          if (predicate) throw new Error(
            `'any' relation cannot have any explicit 'predicate'`);
          return new AnyRelationBuilder(constraints, subject, object, engineKey);
        case 'ref':
          if (predicate) throw new Error(
            `'ref' relation cannot have an explicit 'predicate'`);
          return new RefRelationBuilder(constraints, subject, object, engineKey);
        default: throw new Error(
          `Relationship must have a 'predicate' value or a valid 'kind'`);
      }
    } catch (err) {
      console.log('Failed to compile relation config', config);
      throw err;
    }
  }

  link(nodeCtx, resolver) {
    if (this.isLinked) throw new Error(
      `double linking a RelationBuilder is bad!`);
    this.isLinked = true;
    resolver.allRelations.add(this);
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    return [
      options.stylize(`<${this.constructor.name}`, 'date'),
      options.stylize(this.predicate, 'name'),
      options.stylize(this.direction, 'special'),
      options.stylize(this.specifier, 'special'),
      options.stylize(`'${this.otherName}'`, 'string'),
      options.stylize('/>', 'date'),
    ].join(' ');
  }
}

class ArbitraryRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, predicate, object, engineKey) {
    if (!predicate || predicate.constructor !== String) throw new Error(
      `Relationship 'predicate' must be a String`);
    if (!object && !subject) throw new Error(
      `'arbitrary' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'arbitrary' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Arbitrary';
    this.predicate = predicate;
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.localType = nodeCtx;
    if (this.otherEngineKey) {
      const targetEngine = GraphEngine.get(this.otherEngineKey);
      this.otherType = targetEngine.names.get(this.otherName);
    } else {
      this.otherType = resolver.resolveName(this.otherName);
    }
    if (!this.otherType) throw new Error(
      `Arbitrary relation ${this.stringForm} didn't resolve to a type.`);
  }
}

class RefRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, object, engineKey) {
    if (!object && !subject) throw new Error(
      `'ref' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'ref' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Ref';
    this.predicate = 'REFERENCES';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${this.predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.localType = nodeCtx;
    if (this.otherEngineKey) {
      const targetEngine = GraphEngine.get(this.otherEngineKey);
      this.otherType = targetEngine.names.get(this.otherName);
    } else {
      this.otherType = resolver.resolveName(this.otherName);
    }
    if (!this.otherType) throw new Error(
      `Ref relation ${this.stringForm} didn't resolve to a type.`);
  }
}

class TopRelationBuilder extends RelationBuilder {
  constructor(constraints) {
    super(constraints);

    this.type = 'Top';
    // to really get the point across
    this.predicate = 'TOP';
    this.direction = 'in';
    this.otherName = 'top';

    this.specifier = 'from';
    this.stringForm = `(top)`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.topType = nodeCtx;
  }
}

class AnyRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, object) {
    if (!object && !subject) throw new Error(
      `'any' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'any' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Any';
    // to get the point across
    this.predicate = 'ANY';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `(any) ${this.direction} ${this.specifier} '${this.otherName}'`;
  }
}

class NodeBuilder {
  constructor(name, config) {
    this.name = name;
    this.inner = FieldType.from(config); // TODO: 'REFERS TO' relations
    this.relations = [];

    const references = new Map;
    const visited = new Set;
    function readType(type) {
      if (visited.has(type)) return;
      visited.add(type);

      switch (type.constructor) {
        case ReferenceFieldType:
          references.set([type.engineKey, type.targetName].join('#'), type);
          break;
        case StructFieldType:
          for (const fieldType of type.fields.values())
            readType(fieldType);
          break;
        case AnyOfKeyedFieldType:
          for (const fieldType of type.slots.values())
            readType(fieldType);
          break;
        case PrimitiveFieldType:
        case UnstructuredFieldType:
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

    for (const refType of references.values()) {
      if (refType.anyType)
        continue;
      this.relations.push(RelationBuilder
        .forConfig({
          kind: 'ref',
          engineKey: refType.engineKey,
          object: refType.targetName,
        }));
    }
    if (config.relations) {
      for (const relation of config.relations) {
        this.relations.push(RelationBuilder
          .forConfig(relation));
      }
    }
    if (this.relations.length === 0) {
      console.warn(`Node ${name} has no relations, will be inaccessible`);
    }

    this.behavior = config.behavior || GraphObject;
  }

  async link(resolver) {
    let worked = false;
    try {
      for (const relation of this.relations) {
        await relation.link(this, resolver);
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
      indentationLvl: options.indentationLvl + 2,
    });
    const prefix = ' '.repeat(options.indentationLvl);
    const body = ['inner', 'relations', 'behavior'].map(prop =>
      `${prefix}  ${prop}: ${inspect(this[prop], newOptions)}`
        .replace(/\n/g, `${prefix}    \n`));

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
      options.stylize(`${prefix}</node>`, 'date'),
    ].join('\n');
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    GraphEngineBuilder,
    RelationBuilder,
    ArbitraryRelationBuilder,
    TopRelationBuilder,
    AnyRelationBuilder,
    NodeBuilder,
  };
}
