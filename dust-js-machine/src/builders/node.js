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
    NodeBuilder,
  };
}
