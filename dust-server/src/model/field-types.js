class FieldTypeError extends ExtendableError {
  constructor(type, message) {
    super(`Type ${type.constructor.name} bailed: ${message}`)
    this.path = [];
  }
}

// cache supports recursive purposes
const TypeCache = new Map;

class FieldType {
  constructor(origin, name) {
    this.origin = origin;
    this.name = name;
  }
  fromExt(input) {
    throw new FieldTypeError(this, `fromExt() is not implemented`);
  }
  serialize(input) {
    throw new FieldTypeError(this, `fromExt() is not implemented`);
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
        // TODO: 'choices'
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
    if ('isList' in config && config.isList) {
      type = new ListFieldType(config, type);
    }
    if ('optional' in config && config.optional) {
      type = new OptionalFieldType(config, type);
    }

    pending.final = type;
    TypeCache.set(input, type);

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
  fromExt(input) {
    // TODO: best way of doing this?
    if (this.final) {
      return this.final.fromExt(input);
    }
    throw new FieldTypeError(this,
      `Still pending`);
  }
}

const builtins = new Map;

class BuiltinFieldType extends FieldType {
  constructor(name, constr, ser) {
    super('core', name);
    this.constr = constr;
    this.ser = ser || String;
    //this.de = de || String;
  }
  fromExt(input) {
    if (input == null) throw new FieldTypeError(this,
      `Builtin primitives cannot be null`);
    if (input.constructor !== this.constr) throw new FieldTypeError(this,
      `Was given ${input.constructor.name}, not ${this.constr.name}`);
    return this.constr(input);
  }
}
function NotImpl() {
  throw new FieldTypeError(this, `Not Impl: ${this.name}`);
}
builtins.set(String, new BuiltinFieldType('String', String));
if (self.Blob) builtins.set(Blob, new BuiltinFieldType('Blob', Blob));
builtins.set(Date, new BuiltinFieldType('Date', Date));
builtins.set(Number, new BuiltinFieldType('Number', Number));
builtins.set(Boolean, new BuiltinFieldType('Boolean', Boolean));
builtins.set(JSON, new BuiltinFieldType('JSON', JSON.parse, JSON.stringify));

class GraphReference {
  constructor(target) {
    this.target = target;
  }
  // TODO
}

class ReferenceFieldType extends FieldType {
  constructor(targetPath) {
    super('core', 'Reference');
    this.targetPath = targetPath;
  }
  fromExt(input) {
    if (!input) throw new FieldTypeError(this,
      `Reference cannot be null`);
    if (input.constructor === GraphReference) return input;
    if (input.constructor === GraphGhostNode) return new GraphReference(input);
    if (GraphObject.prototype.isPrototypeOf(input)) return new GraphReference(input);
    if (input.constructor !== GraphBuilderNode) throw new FieldTypeError(this,
      `Reference must be to a GraphBuilderNode or GraphReference or GraphGhostNode or GraphObject, was ${input.constructor.name} (TODO)`);
    if (input.type !== this.targetPath) throw new FieldTypeError(this,
      `Reference expected to be ${this.targetPath}, was ${input.type}`);
    return new GraphReference(input);
  }
}

class OptionalFieldType extends FieldType {
  constructor(config, inner) {
    super('composite', 'Optional');
    this.inner = inner;
  }
  fromExt(input) {
    if (input == null) return null;
    return this.inner.fromExt(input);
  }
}

class ListFieldType extends FieldType {
  constructor(config, inner) {
    super('composite', 'List');
    this.inner = inner;
  }
  fromExt(input) {
    //console.log(input);
    if (!input || input.constructor !== Array) throw new FieldTypeError(this,
      `Was not given an Array`);
    return input.map(x => this.inner.fromExt(x));
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
  fromExt(input) {
    if (!input) throw new FieldTypeError(this,
      `Cannot store a null`);

    const keys = Object.keys(input);
    if (keys.length !== 1) throw new FieldTypeError(this,
      `Requires exactly 1 key, ${keys.length} were given`);
    const [key] = keys;
    if (!this.slots.has(key)) throw new FieldTypeError(this,
      `Doesn't have slot ${JSON.stringify(key)},
      options are ${JSON.stringify(Array.from(this.slots.keys()))}`);

    const slot = this.slots.get(key);
    return { [key]: slot.fromExt(input[key]) };
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

  fromExt(fields) {
    //console.log("===> reading data", fields, 'with', this);
    if (!fields) throw new FieldTypeError(this,
      `Given falsey struct, can't read from that!`);
    if (fields.constructor !== Object) throw new FieldTypeError(this,
      `Given non-Object ${fields.constructor.name} struct, won't read from that!`);

    const data = {};
    const extraKeys = new Set(Object.keys(fields));
    for (const [key, field] of this.fields) {
      this.setField(data, key, fields[key]);
      extraKeys.delete(key);
    }
    if (extraKeys.size) throw new FieldTypeError(this,
      `Extra struct keys: ${JSON.stringify(Array.from(extraKeys))}`);
    return data;
  }
  setField(data, path, value) {
    try {
      if (!this.fields.has(path)) throw new FieldTypeError(this,
        `Struct setField() called on missing path ${path}`);
      const field = this.fields.get(path);
      //console.log('setField', field, value);

      data[path] = field.fromExt(value);
      //throw new Error(`not impl: setField(${JSON.stringify(data)}, ${JSON.stringify(path)}, ${JSON.stringify(value)})`);
    } catch (ex) {
      if (ex.constructor === FieldTypeError) {
        ex.message += ` (${path})`;
        ex.path.unshift(path);
      }
      throw ex;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    FieldTypeError,
    FieldType,
    PendingFieldType,
    BuiltinFieldType,
    GraphReference,
    ReferenceFieldType,
    OptionalFieldType,
    ListFieldType,
    AnyOfKeyedFieldType,
    StructFieldType,
  };
}
