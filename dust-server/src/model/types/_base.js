class FieldTypeError extends ExtendableError {
  constructor(type, message) {
    super(`Type ${type.constructor.name} bailed: ${message}`)
    this.path = [];
  }
}

// cache supports recursive purposes
const TypeCache = new Map;
const builtinTypes = new Map;

class FieldType {
  constructor(origin, name) {
    this.origin = origin;
    this.name = name;
  }
  fromExt(input) {
    throw new FieldTypeError(this, `${this.constructor.name} fromExt() is not implemented`);
  }
  serialize(input) {
    throw new FieldTypeError(this, `${this.constructor.name} serialize() is not implemented`);
  }

  static from(input) {
    if (TypeCache.has(input)) {
      return TypeCache.get(input);
    }

    const pending = new PendingFieldType(input);
    TypeCache.set(input, pending);

    // support a shorthand for the JS-native primitives
    const config = builtinTypes.has(input)
      ? {type: input} : input;

    let type = '';
    switch (true) {
      case !['object', 'function'].includes(typeof config):
        throw new Error(`Unrecognized type value type ${typeof config}`)
      case FieldType.prototype.isPrototypeOf(config.type):
        type = config.type;
        break;
      case builtinTypes.has(config.type):
        // TODO: 'choices'
        type = builtinTypes.get(config.type);
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

const accessorInstances = new Map; // FieldType inst => Accessor inst
const accessorConstructors = new Map; // FieldType constr => Accessor constr

class FieldAccessor {
  constructor(myType) {
    Object.defineProperty(this, 'myType', {value: myType});
  }

  static forType(theType) {
    if (accessorInstances.has(theType))
      return accessorInstances.get(theType);
    const accessor = this.constructForType(theType);
    accessorInstances.set(theType, accessor);
    return accessor;
  }

  static constructForType(theType) {
    if (theType.constructor === PendingFieldType) {
      if (theType.final) {
        return this.constructForType(theType.final);
      }
      throw new Error(`PendingFieldType is still pending`);
    }

    if (accessorConstructors.has(theType.constructor)) {
      const constr = accessorConstructors.get(theType.constructor);
      return new constr(theType);
    } else {
      console.log('constructor for', theType)
      throw new Error(
        `FieldAccessor#constructForType() can't handle ${theType.constructor.name}`);
    }
  }

  mapOut() {
    throw new Error(`Reading from ${this.constructor.name} is not implemented`);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    FieldType,
    FieldTypeError,
    PendingFieldType,

    FieldAccessor,

    builtinTypes,
    accessorConstructors,
  };
}
