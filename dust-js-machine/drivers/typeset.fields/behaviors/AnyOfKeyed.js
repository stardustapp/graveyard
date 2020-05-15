class AnyOfKeyedVal {}

CURRENT_LOADER.attachBehavior(class AnyOfKeyed {
  build({config, typeResolver}) {
    this.slots = new Map;
    for (const key in config.anyOfKeyed) {
      this.slots.set(key, typeResolver(config.anyOfKeyed[key]));
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


  mapOut(structVal, graphCtx, node) {
    if (!graphCtx) throw new Error(
      `AnyOfKeyed#mapOut( graphCtx is required!`);
    if (!structVal) throw new Error(
      `AnyOfKeyed#mapOut() structVal is required!`);
    if (structVal.constructor !== Array) throw new Error(
      `AnyOfKeyed#mapOut() got non-Array ${structVal.constructor.name}`);

    const target = Object.create(AnyOfKeyedVal.prototype);
    Object.defineProperty(target, 'currentKey', {
      get() {
        return structVal[0];
      },
    });

    for (const [slotKey, slotType] of this.slots) {
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in slotType) {
        propOpts.get = function() {
          //console.log('getting', slotKey, 'from', structVal);
          if (slotKey === structVal[0]) {
            return slotType.mapOut(structVal[1], graphCtx, node);
          } else {
            return null;
          }
        };
      }

      if ('mapIn' in slotType) {
        propOpts.set = function(newVal) {
          if (structVal[0] !== slotKey) console.warn(
            `WARN: AnyOfKeyed changed from '${structVal[0]}' to '${slotKey}'`);
          //console.log('setting', slotKey, 'as', slotKey, newVal);
          structVal[0] = slotKey;
          structVal[1] = slotType.mapIn(newVal, graphCtx, node);
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
      if (!this.slots.has(liveKey)) throw new Error(
        `AnyOfKeyed#mapIn() got unrecognized liveKey '${liveKey}'`);

      const data = [liveKey, undefined];
      const accInst = this.mapOut(data, graphCtx, node);
      accInst[liveKey] = newVal[liveKey];
      return data;
    } else if (newVal.constructor === AnyOfKeyedVal) {
      const slotType = this.slots.get(newVal.currentKey);
      if (!slotType) throw new Error(
        `Incompatible key ${newVal.currentKey} for AnyOfKeyed`);
      const innerVal = newVal[newVal.currentKey];
      return [newVal.currentKey, slotType.mapIn(innerVal, graphCtx, node)];
    } else throw new Error(
      `AnyOfKeyed can't map in values of ${newVal.constructor.name}`);
  }

  // intended as general-purpose replacement for ex. gatherRefs
  accept(element, visitor) {
    visitor.visit(this, element);
    if (element === Symbol.for('meta')) {
      for (const [name, slotType] of this.slots)
        if (visitor.offer(slotType))
          slotType.accept(element, visitor);
    } else {
      const {currentKey} = rawVal;
      if (!this.slots.has(currentKey)) throw new Error(
        `AnyOfKeyed#accept() got unrecognized currentKey '${currentKey}'`);
      const slot = this.slots.get(currentKey);
    }
  }
  // TODO: remove
  gatherRefs(rawVal, refs) {
    if (rawVal.constructor !== AnyOfKeyed) throw new Error(
      `AnyOfKeyed#gatherRefs() got external value ${rawVal.constructor.name}`);

    const {currentKey} = rawVal;
    if (!this.slots.has(currentKey)) throw new Error(
      `AnyOfKeyed#gatherRefs() got unrecognized currentKey '${currentKey}'`);

    const slot = this.slots.get(currentKey);
    if ('gatherRefs' in slot)
      slot.gatherRefs(rawVal[currentKey], refs);
  }

  exportData([currentKey, data], opts) {
    const slot = this.slots.get(currentKey);
    return [currentKey, slot.exportData(data, opts)];
  }
});
