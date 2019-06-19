class EntityProvider {
  constructor(myType, myId) {
    Object.defineProperties(this, {
      'myType': {
        value: myType,
        enumerable: true,
        configurable: false,
      },
      'myId': {
        value: myId,
        enumerable: true,
        configurable: false,
      },
      'nameRegistry': {
        value: new Map,
        enumerable: false,
        configurable: false,
      },
      'allSignatures': {
        value: new Set,
        enumerable: false,
        configurable: false,
      },
    });
    //this.builtEntities = 0;
  }

  exportNewEntity(name, kindName, options={}) {
    if (this.nameRegistry.has(name)) throw new Error(
      `Cannot re-export name ${name}`);

    const kind = EntityKinds.get(kindName);
    if (!kind) throw new Error(
      `Tried to export entity of weird kind ${kindName}`);
    if (kind.prototype instanceof EntityBase) {
      this.nameRegistry.set(name, new kind(this, name, options));
    } else throw new Error(
      `Can only register entities to EntityProvider`);
  }

  invokeEntity(name, args) {
    const entity = this.nameRegistry.get(name);
    if (!entity) throw new Error(
      `Tried to invoke entity of weird kind ${name}`);
    if (typeof entity.invoke !== 'function') throw new Error(
      `Entity ${name} is not invokable`);
    return entity.invoke(this, args);
  }

  readSignature(rawSig) {
    if (typeof rawSig !== 'string') throw new Error(
      `Signature can only be a string for now`);
    const signature = new EntitySignature(rawSig);
    this.allSignatures.add(signature);
    return signature;
  }

  readEntity(signature, rawValue) {
    const entity = signature.resolveWith(this);
    console.log('Provider.readEntity:', {signature, entity, rawValue});
    if (typeof entity.readEntity !== 'function')
      throw new Error(`Entity '${signature}' is '${entity.constructor.name}', isn't readable`);
    return entity.readEntity(rawValue);
  }
}

class EntitySignature {
  constructor(raw) {
    if (raw.includes('->')) throw new Error(
      `TODO: Signatures cannot describe anonymous Functions yet`);
    if (raw.includes(' ')) throw new Error(
      `Signatures cannot contain whitespace yet`);

    this.parts = raw.split('/');
    if (this.parts.some(x => x.length === 0)) throw new Error(
      `Signature has empty parts`);
  }
  resolveWith(provider) {
    let final = provider;
    for (const part of this.parts) {
      if (final.constructor.prototype instanceof EntityProvider || final.constructor === EntityProvider) {
        final = final.nameRegistry.get(part);
        // TODO: handle Import types instead
      } else if (final.constructor === ImportEntity) {
        final = final.resolveName(part);
      } else throw new Error(
        `Name '${part}' in '${this.parts.join('/')}' isn't resolving from a provider`);
      if (!final) throw new Error(
        `Failed to select name '${part}' in '${this.parts.join('/')}'`);
    }
    return final;
  }
  toString() {
    return this.parts.join('/');
  }
}

class EntityBase {
  constructor(providedBy, myName, myKind) {
    Object.defineProperties(this, {
      'providedBy': {
        value: providedBy,
        enumerable: true,
        configurable: false,
      },
      'myName': {
        value: myName,
        enumerable: true,
        configurable: false,
      },
      'myKind': {
        value: myKind,
        enumerable: true,
        configurable: false,
      },
    });
  }
}

function ensureKeys(obj, okMap) {
  const badKeys = new Set;
  for (const key in obj)
    if (key in okMap) {
      if (typeof obj[key] !== okMap[key]) {
        console.log('Unexpected value:', obj[key]);
        throw new Error(
          `Key '${key}' wanted ${okMap[key]}, is actually ${typeof obj[key]}`);
      }
    } else badKeys.add(key);

  if (badKeys.size > 0) throw new Error(
      `Object had unexpected keys ${Array.from(badKeys).join(', ')}; expected ${Object.keys(okMap).join(', ')}`);
}

class MethodicalEntityBase extends EntityBase {
  constructor(providedBy, name, type, opts) {
    super(providedBy, name, type);

    this.methods = new Map;
    for (const methodName in opts.methods) {
      const spec = {
        self: name,
        ...opts.methods[methodName],
      };
      const func = new FunctionEntity(providedBy, name+'.'+methodName, spec);
      this.methods.set(methodName, func);
    }

    this.bases = new Set;
    for (const name of opts.bases || []) {
      this.bases.add(providedBy.readSignature(name));
    }
  }
}


class NativeObjectEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {constructorName: 'string'});
    super(providedBy, name, 'NativeObject');
    this.constructorName = opts.constructorName;
  }
  readEntity(rawValue) {
    if (this.constructorName) {
      if (typeof rawValue !== 'object') throw new Error(
        `NativeObject was expecting object, not ${typeof rawValue}`);
      if (rawValue.constructor.name !== this.constructorName) throw new Error(
        `NativeObject was expecting '${this.constructorName}', not '${rawValue.constructor.name}'`);
      return rawValue;
    } else throw new Error(
      `NativeObject had no specification`);
  }
}

// class CustomKindEntity extends EntityBase {
//   constructor(providedBy, name, opts) {
//     super(providedBy, name, 'Type');
//   }
// }

class DataTypeEntity extends MethodicalEntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {
      ingest: 'function', export: 'function',
      methods: 'object', bases: 'object',
    });
    super(providedBy, name, 'DataType', opts);

    if ('ingest' in opts)
      this.ingestFunc = opts.ingest;
    if ('export' in opts)
      this.exportFunc = opts.export;
  }
  invoke(provider, rawInput) {
    const frame = new DataFrameEntity(provider, this.myName, {
      dataType: this,
    });
    frame.replaceData(rawInput);
    return frame;
  }
}

// I guess this is a box
class DataFrameEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {dataType: 'object'});
    super(providedBy, name, 'DataFrame');
    this.dataType
  }
}

class InterfaceEntity extends MethodicalEntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {
      methods: 'object', bases: 'object',
    });
    super(providedBy, name, 'Interface', opts);
  }
  readEntity(rawValue) {
    console.log('interface reading', rawValue);
    throw new Error()
  }
}

class FunctionEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {self: 'string', input: 'string', output: 'string', impl: 'function'});
    super(providedBy, name, 'Function');
    if ('self' in opts)
      this.selfSig = providedBy.readSignature(opts.self);
    if ('input' in opts)
      this.inputSig = providedBy.readSignature(opts.input);
    if ('output' in opts)
      this.outputSig = providedBy.readSignature(opts.output);
    if ('impl' in opts)
      this.implFunc = opts.impl;
  }
  invoke(provider, rawInput=undefined, rawSelf=undefined) {
    if (typeof this.implFunc !== 'function') throw new Error(
      `Function has no implementation, can't be invoked`);

    let input;
    if ('inputSig' in this) {
      input = this.providedBy.readEntity(this.inputSig, rawInput);
    } else if (rawInput !== undefined) throw new Error(
      `Input was passed to Function when it wasn't expected`);

    // TODO
    let self;
    if ('selfSig' in this) {
      self = this.providedBy.readEntity(this.selfSig, rawSelf);
    } else if (rawSelf !== undefined) throw new Error(
      `Self was passed to Function when it wasn't expected`);

    const rawOutput = this.implFunc.call(self, input);

    if (rawOutput && typeof rawOutput.then === 'function') {
      return rawOutput.then(out => {
        if ('outputSig' in this) {
          return this.providedBy.readEntity(this.outputSig, out)
        } else if (out !== undefined) throw new Error(
          `Function returned Output async when it wasn't expected`);
      });
    } else {
      if ('outputSig' in this) {
        return this.providedBy.readEntity(this.outputSig, rawOutput)
      } else if (rawOutput !== undefined) throw new Error(
        `Function returned Output when it wasn't expected`);
    }
  }
}

class ImportEntity extends EntityBase {
  constructor(providedBy, name, opts) {
    ensureKeys(opts, {driver: 'object'});
    super(providedBy, name, 'Import');
    if ('driver' in opts) {
      this.sourceType = 'EntityProvider';
      if (!(opts.driver.constructor.prototype instanceof EntityProvider || opts.driver.constructor === EntityProvider)) throw new Error(
        `ImportEntity given ${opts.driver.constructor.name} that isn't an EntityProvider`);
      this.source = opts.driver;
    }
  }
  resolveName(name) {
    return this.source.nameRegistry.get(name);
  }
}

// class InstanceEntity extends EntityBase {
//   constructor(providedBy, name, opts) {
//     ensureKeys(opts, {driver: 'object'});
//     super(providedBy, name, 'Instance');
//   }
// }

const EntityKinds = new Map;
EntityKinds.set('NativeObject', NativeObjectEntity);
EntityKinds.set('DataType', DataTypeEntity);
EntityKinds.set('DataFrame', DataFrameEntity);
EntityKinds.set('Interface', InterfaceEntity);
EntityKinds.set('Function', FunctionEntity);
EntityKinds.set('Import', ImportEntity);
// EntityKinds.set('Instance', InstanceEntity);

module.exports = {
  EntityProvider,
  EntityBase,

  NativeObjectEntity,
  DataTypeEntity,
  InterfaceEntity,
  FunctionEntity,
  //InstanceEntity,
};
