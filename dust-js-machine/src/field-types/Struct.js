
class StructFieldType extends FieldType {
  constructor(config) {
    super('composite', 'Struct');

    this.fields = new Map;
    this.defaults = new Map;
    for (const key in config.fields) {
      this.fields.set(key, FieldType.from(config.fields[key]));
      if ('defaultValue' in config.fields[key]) {
        this.defaults.set(key, config.fields[key].defaultValue);
      }
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


class StructAccessor extends FieldAccessor {
  constructor(type) {
    super(type);

    this.fields = type.fields;
    this.defaults = type.defaults;
  }

  mapOut(structVal, graphCtx, node, forceTarget=null) {
    const target = forceTarget || Object.create(null);
    if (!graphCtx) throw new Error(
      `graphCtx is required!`);

    for (const [name, fieldType] of this.fields) {
      const fieldAccessor = FieldAccessor.forType(fieldType);
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in fieldAccessor) {
        propOpts.get = function() {
          //console.log('getting', name, 'as', fieldType.constructor.name);
          return fieldAccessor.mapOut(structVal[name], graphCtx, node);
        };
      }

      if ('mapIn' in fieldAccessor) {
        propOpts.set = function(newVal) {
          //console.debug('setting', name, 'as', fieldType.constructor.name, newVal);
          structVal[name] = fieldAccessor.mapIn(newVal, graphCtx, node);
          node.markDirty();
          //graphCtx.flushNodes();
          return true;
        };
      }

      Object.defineProperty(target, name, propOpts);
    }
    //Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx, node, target=null) {
    if (newVal.constructor === Object || newVal.constructor === GraphNode) {
      const dataObj = Object.create(null);
      // create temporary instance to fill in the data
      const accInst = this.mapOut(dataObj, graphCtx, node, target);
      const allKeys = new Set(this.fields.keys());
      const givenKeys = new Set(Object.keys(newVal));
      //Object.keys(newVal).forEach(x => allKeys.add(x));
      for (const key of allKeys) {
        accInst[key] = newVal[key] != null ? newVal[key] : this.defaults.get(key);
        givenKeys.delete(key);
      }
      if (givenKeys.size !== 0) throw new Error(
        `Struct in ${node.nodeType} got unknown keys ${Array.from(givenKeys).join(', ')}, expected ${Array.from(allKeys).join(', ')}`);
      return dataObj;

    } else if (newVal.constructor === undefined) {
      // this is probably us, right?
      throw new Error('TODO: struct mapIn');
      return newVal;

    } else throw new Error(
      `StructAccessor can't map in values of ${newVal.constructor.name}`);
  }

  gatherRefs(struct, refs) {
    for (const [name, fieldType] of this.fields) {
      const fieldAccessor = FieldAccessor.forType(fieldType);
      //console.log('struct ZgatherRefs', name, struct, struct[name])
      if ('gatherRefs' in fieldAccessor)
        fieldAccessor.gatherRefs(struct[name], refs);
    }
  }
  exportData(struct, opts) {
    const obj = {};
    for (const [name, fieldType] of this.fields) {
      const accessor = FieldAccessor.forType(fieldType);
      const value =  accessor.exportData(struct[name], opts);
      if (value !== undefined)
        obj[name] = value;
    }
    return obj;
  }
}

accessorConstructors.set(StructFieldType, StructAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    StructFieldType,
    StructAccessor,
  };
}
