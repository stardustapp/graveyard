class PlatformApi {
  constructor(name) {
    this.name = name;
    this.paths = new Map;
    this.env = new Environment();

    // this gets filled in at .compile()
    this.structType = new PlatformApiTypeFolder(name);
  }

  getter(path, type, impl) {
    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiGetter(this, baseName, type, impl);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }
  function(path, args) {
    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    const device = new PlatformApiFunction(this, baseName, args);
    this.paths.set(path, device);
    this.env.bind(path, device);
    return this;
  }

  // build the data structure which is used to transfer APIs by-value
  compile() {
    console.log('Compiling', name);
    const fields = [];
    for (let [path, entry] of this.paths) {
      if (entry.constructor === PlatformApiGetter) {
        // TODO: nesting!
        fields.push(entry.type);
      }
    }
    this.structType.fields = fields;
  }

  // flattens the API into a JavaScript-style object
  construct(self) {
    var obj = {};
    this.paths.forEach((val, path) => {
      const key = path.slice(1).replace(/ [a-z]/, x => x[1].toUpperCase(1));
      switch (val.constructor) {
        case PlatformApiFunction:
          obj[key] = input => val.impl.call(self, input);
          break;
        case PlatformApiGetter:
          obj[key] = () => val.impl.call(self);
          break;
        default:
          throw new Error(`PlatformApi had path of weird constructor ${val.constructor}`);
      }
    });
  }

  getEntry(path) {
    return this.env.getEntry(path);
  }
}

class PlatformApiGetter {
  constructor(self, name, type, impl) {
    this.self = self;
    this.type = PlatformApiType.from(type, name);
    this.impl = impl;
    this.get = this.get.bind(this);
  }
  get(self=this.self) {
    return this.impl
        .call(self)
        .then(x => this.outputType.serialize(x));
  }
}

class PlatformApiFunction {
  constructor(self, name, {input, output, impl}) {
    this.self = self;
    this.inputType = PlatformApiType.from(input, 'input');
    this.outputType = PlatformApiType.from(output, 'output');
    this.impl = impl;
    this.invoke = this.invoke.bind(this);
  }
  invoke(input, self=this.self) {
    return this.impl
        .call(self, this.inputType.deserialize(input))
        .then(x => ({
          get: () => this.outputType.serialize(x),
        }));
  }
  getEntry(path) {
    switch (path) {
      case '':
        return new FlatEnumerable(
          new StringLiteral('input'),
          new StringLiteral('output'),
          {Type: 'Function', Name: 'invoke'});
      case '/input':
        return { get: () => this.inputType.name };
      case '/output':
        return { get: () => this.outputType.name };
      case '/invoke':
        return this;
    }
  }
}


class PlatformTypeError extends ExtendableError {
  constructor(fieldName, expectedType, actualType) {
    super(`API field ${JSON.stringify(fieldName)} is supposed to be type ${expectedType} but was actually ${actualType}`);
    this.fieldName = fieldName;
    this.expectedType = expectedType;
    this.actualType = actualType;
  }
}

class PlatformApiTypeString {
  constructor(name, defaultValue=null, ser=String, de=String) {
    this.name = name;
    this.defaultValue = defaultValue;
    this.ser = ser;
    this.de = de;
  }
  serialize(value) {
    if (value == null)
      value = this.defaultValue;
    return new StringLiteral(this.name, this.ser(value));
  }
  deserialize(literal) {
    if (!literal) {
      if (this.defaultValue != null)
        return this.defaultValue;
      throw new PlatformTypeError(this.name, 'String', 'Empty');
    }
    if (literal.Type !== 'String')
      throw new PlatformTypeError(this.name, 'String', literal.Type);
    return this.de(literal.StringValue);
  }
}

class PlatformApiTypeNull {
  constructor(name) {
    this.name = name;
  }
  serialize(value) {
    if (value != null)
      throw new Error(`Null type can't serialize anything other than null`);
    return null;
  }
  deserialize(literal) {
    if (literal != null)
      throw new Error(`Null type can't deserialize anything other than null`);
    return null;
  }
}

class PlatformApiTypeFolder {
  constructor(name, fields=[]) {
    this.name = name;
    this.fields = fields;
  }
  serialize(value) {
    return new FolderLiteral(this.name, this.fields
        .map(field => field.serialize(value[field.name])))
  }
  deserialize(literal) {
    if (!literal)
      throw new Error(
        `Folder ${
          JSON.stringify(this.name)
        } is required`);
    if (literal.Type !== 'Folder')
      throw new PlatformTypeError(this.name, 'Folder', literal.Type);

    const {Children} = literal;
    const struct = {};
    const givenKeys = new Set(Children.map(x => x.Name));
    for (const field of this.fields) {
      givenKeys.delete(field.name);
      const child = Children.find(x => x.Name === field.name);
      // TODO: transform struct keys for casing
      struct[field.name] = field.deserialize(child);
    }
    if (givenKeys.size !== 0) {
      throw new Error(
        `Folder ${
          JSON.stringify(this.name)
        } had extra children: ${
          Array.from(givenKeys).join(', ')
        }`);
    }
    return struct;
  }
}

class PlatformApiType {
  static from(source, name) {
    if (source == null)
      return new PlatformApiTypeNull(name);

    // recognize a constructor vs. a literal default-value
    const sourceIsBareFunc = source.constructor === Function;
    const typeFunc = sourceIsBareFunc ? source : source.constructor;
    const givenValue = sourceIsBareFunc ? null : source;

    //console.log('schema', name, 'type', typeFunc, 'default', givenValue);
    switch (typeFunc) {

      // string-based literals
      case String:
        return new PlatformApiTypeString(name, givenValue);
      case Number:
        return new PlatformApiTypeString(name, givenValue,
            String,
            parseFloat);
      case Boolean:
        return new PlatformApiTypeString(name, givenValue,
            b => b ? 'yes' : 'no',
            s => ({yes: true, no: false})[s]);

      // nested data structures
      case Object: // TODO: better way to detect structures
        if (sourceIsBareFunc) {
          // blackbox objects become JSON strings lol fite me
          return new PlatformApiTypeString(name, {},
              JSON.stringify,
              JSON.parse);
        } else {
          const fields = Object
              .keys(givenValue)
              .map(name => PlatformApiType
                  .from(givenValue[name], name));
          return new PlatformApiTypeFolder(name, fields);
        }
      case PlatformApi:
        if (sourceIsBareFunc)
          throw new Error(`PlatformApi must be passed as a created instance`);
        return givenValue.structType;

      default:
        throw new Error(`Unable to implement type for field ${JSON.stringify(name)}`);
    }
  }
}