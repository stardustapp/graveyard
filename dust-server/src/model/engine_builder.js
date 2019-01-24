const GraphEngineBuilder = function() {

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
      this.names.set(name, new NodeBuilder(conf));
    }

    struct(name, conf) {
      if (this.names.has(name)) throw new Error(
        `GraphEngineBuilder was already presented the name ${JSON.stringify(name)}`);
      this.names.set(name, new StructBuilder(conf));
    }

    install() {
      for (const entry in this.names.entries()) {
        entry.compile(this);
      }
      throw new Error('TODO 1');
    }
  }

  // cache supports recursive purposes
  const TypeCache = new Map;
  
  class FieldType {
    constructor(origin, name) {
      this.origin = origin;
      this.name = name;
    }

    static from(input) {
      if (TypeCache.has(input)) {
        return TypeCache.get(input);
      }
      const pending = new PendingFieldType(input);
      TypeCache.set(input, pending);

      // support a shorthand for the JS-native primitives
      const config = builtins.has(input)
        ? {type: input} : input;

      let type = '';
      switch (true) {
        case FieldType.prototype.isPrototypeOf(config.type):
          type = config.type;
          break;
        case builtins.has(config.type):
          type = builtins.get(config.type);
          break;
        case 'reference' in config:
          type = new ReferenceFieldType(config.reference);
          break;
        case 'anyOfKeyed' in config:
          type = new AnyOfKeyedFieldType(config.anyOfKeyed);
          break;
        case 'fields' in config:
          type = new StructFieldType(config);
          break;
        default:
          console.warn(config);
          throw new Error(`Unrecognized field type for ${JSON.stringify(config.type)}`);
      }

      // opt-in for wrapping with extra single-slot types
      if ('isList' in config) {
        type = new ListFieldType(config, type);
      }
      if ('optional' in config) {
        type = new OptionalFieldType(config, type);
      }

      pending.final = type;
      TypeCache.set(input, type);

      console.log('type', type);
      return type;
    }
  }

  // support caching
  class PendingFieldType extends FieldType {
    constructor(source) {
      super('fake', 'pending');
      this.source = source;
      this.final = null;
    }
  }

  const builtins = new Map;
  builtins.set(String, new FieldType('core', 'String'));
  builtins.set(Date, new FieldType('core', 'Date'));
  builtins.set(Number, new FieldType('core', 'Number'));
  builtins.set(Boolean, new FieldType('core', 'Boolean'));

  class ReferenceFieldType extends FieldType {
    constructor(targetPath) {
      super('core', 'Reference');
      this.targetPath = targetPath;
    }
  }
  
  class OptionalFieldType extends FieldType {
    constructor(config, inner) {
      super('composite', 'Optional');
      this.inner = inner;
    }
  }
  
  class ListFieldType extends FieldType {
    constructor(config, inner) {
      super('composite', 'List');
      this.inner = inner;
    }
  }
  
  class AnyOfKeyedFieldType extends FieldType {
    constructor(keys) {
      super('composite', 'AnyOfKeyed');

      this.slots = new Map;
      for (const key in keys) {
        this.slots.set(key, FieldType.from(keys[key]));
      }
    }
  }

  class StructFieldType extends FieldType {
    constructor(config) {
      super('composite', 'Struct');

      this.fields = new Map;
      for (const key in config.fields) {
        this.fields.set(key, FieldType.from(config.fields[key]));
      }
    }
  }

  class EnginePartBuilder {}

  class StructBuilder extends EnginePartBuilder {
    constructor(config) {
      super();
      this.inner = FieldType.from(config);
    }
  }

  class NodeBuilder extends EnginePartBuilder {
    constructor(config) {
      super();
      this.inner = FieldType.from(config);

      if (!['root', 'leaf', 'parent'].includes(config.treeRole)) throw new Error(
        `Tree role ${JSON.stringify(config.treeRole)} is not valid`);
      this.treeRole = config.treeRole;
    }

    compile(builder) {
      console.log('making struct', this, builder);
      throw new Error(`TODO 2`);
    }
  }

  return GraphEngineBuilder;
}();