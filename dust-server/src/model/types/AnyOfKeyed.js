
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


class AnyOfKeyed {}
class AnyOfKeyedAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.slots = type.slots;
  }

  mapOut(structVal, graphCtx, node) {
    if (!graphCtx) throw new Error(
      `graphCtx is required!`);
    if (structVal.constructor !== Array) throw new Error(
      `AnyOfKeyed#mapOut() got non-Array ${structVal.constructor.name}`);

    const target = Object.create(AnyOfKeyed.prototype);
    Object.defineProperty(target, 'currentKey', {
      get() {
        return structVal[0];
      },
    });

    for (const [slotKey, slotType] of this.slots) {
      const slotAccessor = FieldAccessor.forType(slotType);
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in slotAccessor) {
        propOpts.get = function() {
          //console.log('getting', slotKey, 'as', slotType.constructor.slotKey);
          if (slotKey === structVal[0]) {
            return slotAccessor.mapOut(structVal[1], graphCtx, node);
          } else {
            return null;
          }
        };
      }

      if ('mapIn' in slotAccessor) {
        propOpts.set = function(newVal) {
          if (structVal[0] !== slotKey) console.warn(
            `WARN: AnyOfKeyed changed from '${structVal[0]}' to '${slotKey}'`);
          //console.log('setting', slotKey, 'as', slotKey, newVal);
          structVal[0] = slotKey;
          structVal[1] = slotAccessor.mapIn(newVal, graphCtx, node);
          return true;
        };
      }

      Object.defineProperty(target, slotKey, propOpts);
    }
    //Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal == null) throw new Error(
      `AnyOfKeyed received a null. Consider setting 'optional' to allow.`);

    if (newVal.constructor === Object) {
      const keys = Object.keys(newVal);
      if (keys.length !== 1) throw new Error(
        `AnyOfKeyed got ${keys.length} keys instead of exactly 1. Received: ${keys.join(', ')}`);
      const [liveKey] = keys;

      const data = [liveKey, undefined];
      const accInst = this.mapOut(data, graphCtx, node);
      accInst[liveKey] = newVal[liveKey];
      return data;
    } else if (newVal.constructor === 'TODO') {
      // this is probably us, right?
      return newVal;
    } else throw new Error(
      `AnyOfKeyedAccessor can't map in values of ${newVal.constructor.name}`);
  }

  gatherRefs(rawVal, refs) {
    if (rawVal.constructor !== AnyOfKeyed) throw new Error(
      `AnyOfKeyed#gatherRefs() got external value ${rawVal.constructor.name}`);

    const {currentKey} = rawVal;
    const slotAccessor = FieldAccessor.forType(this.slots.get(currentKey));
    if ('gatherRefs' in slotAccessor)
      slotAccessor.gatherRefs(rawVal[currentKey], refs);
  }
  async exportData([liveKey, data], opts) {
    const accessor = FieldAccessor.forType(this.slots.get(liveKey));
    return [liveKey, await accessor.exportData(data, opts)];
  }
}

accessorConstructors.set(AnyOfKeyedFieldType, AnyOfKeyedAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    AnyOfKeyed,
    AnyOfKeyedFieldType,
    AnyOfKeyedAccessor,
  };
}
