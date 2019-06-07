class StructVal {}

const setFullStack = new Array;
const setStack = new Array;
let setTrace = null;

CURRENT_LOADER.attachBehavior(class Struct {
  build({config, typeResolver}) {
    this.fields = new Map;
    this.defaults = new Map;

    for (const key in config.fields) {
      this.fields.set(key, typeResolver(config.fields[key]));
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


  mapOut(structVal, graphCtx, node, forceTarget=null) {
    const target = forceTarget || Object.create(StructVal.prototype);
    if (!graphCtx) throw new Error(
      `graphCtx is required!`);

    for (const [name, fieldType] of this.fields) {
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in fieldType) {
        propOpts.get = function() {
          //console.log('getting', name, 'as', fieldType.constructor.name);
          return fieldType.mapOut(structVal[name], graphCtx, node);
        };
      }

      if ('mapIn' in fieldType) {
        propOpts.set = function(newVal) {
          if (setStack.length < 1) {
            setTrace = new Error().stack;
            setFullStack.length = 0;
          }
          try {
            setStack.push(name);
            setFullStack.push(name);
            //console.debug('setting', name, 'as', fieldType.constructor.name, newVal);
            structVal[name] = fieldType.mapIn(newVal, graphCtx, node);
            node.markDirty();
            //graphCtx.flushNodes();
            return true;
          } catch (err) {
            if (setStack.length > 1) throw err;
            const myErr = new Error(`Failed to set "${setFullStack.join('.')}": ${err.message}`);
            myErr.stack = [myErr.stack.split('\n')[0], ...setTrace.split('\n').slice(1)].join('\n');
            throw myErr;
          } finally {
            setStack.pop();
          }
        };
      }

      Object.defineProperty(target, name, propOpts);
    }
    //Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx, node, target=null) {
    //if (newVal.constructor === Object) {
    if (newVal.constructor === Object || newVal.constructor === StructVal) {
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
      console.log('mapIn from', newVal.constructor)
      throw new Error('TODO: struct mapIn');
      return newVal;

    } else throw new Error(
      `Struct can't map in values of ${newVal.constructor.name}`);
  }


  // intended as general-purpose replacement for ex. gatherRefs
  accept(element, visitor) {
    visitor.visit(this, element);
    const isMetaVisitor = element === Symbol.for('meta');
    for (const [name, fieldType] of this.fields) {
      //console.log('struct visiting', fieldType)
      fieldType.accept(isMetaVisitor ? element : element[name], visitor);
    }
  }
  // TODO: remove
  gatherRefs(struct, refs) {
    for (const [name, fieldType] of this.fields) {
      //console.log('struct ZgatherRefs', name, struct, struct[name])
      if ('gatherRefs' in fieldType)
        fieldType.gatherRefs(struct[name], refs);
    }
  }

  exportData(struct, opts) {
    const obj = {};
    for (const [name, fieldType] of this.fields) {
      const value = fieldType.exportData(struct[name], opts);
      if (value !== undefined)
        obj[name] = value;
    }
    return obj;
  }

});
