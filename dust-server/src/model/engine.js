function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  let str = base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  // TODO: debug/account for too-short IDs
  //console.log('random str', bytes, str);
  return str;
}

class GraphObject {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    //console.log('created GraphObject', data, type);

    for (const [key, fieldType] of type.inner.fields.entries()) {
      Object.defineProperty(this, key, {
        get() { return data.fields[key]; }, // TODO
        //set(newValue) { bValue = newValue; },
        enumerable: true,
        configurable: true
      });
    }
  }
}

const GraphEngines = new Map;
const EngineExtensions = new Map;

class GraphEngine {
  constructor(key, builder) {
    if (GraphEngines.has(key)) throw new Error(
      `Graph Engine ${key} is already registered, can't re-register`);

    this.engineKey = key;
    this.names = builder.names;
    GraphEngines.set(key, this);

    if (!EngineExtensions.has(key))
      EngineExtensions.set(key, {});
    this.extensions = EngineExtensions.get(key);
  }

  static get(key) {
    if (!GraphEngines.has(key)) throw new Error(
      `Graph Engine ${JSON.stringify(key)} is not registered`);
    return GraphEngines.get(key);
  }

  static extend(key) {
    let exts = EngineExtensions.get(key);
    if (!EngineExtensions.has(key)) {
      exts = {};
      EngineExtensions.set(key, exts);
    }
    return exts;
  }

  spawnObject(data) {
    const type = this.names.get(data.type);
    if (!type) throw new Error(
      `Object ${data.objectId} ${JSON.stringify(data.name)
      } has unimplemented type ${JSON.stringify(data.type)}`);
    return new type.behavior(type, data);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphObject,
    GraphEngine,
  };
}
