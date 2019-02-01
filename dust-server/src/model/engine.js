function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

class GraphObject {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    //console.log('created GraphObject', data, type);
  }
}

const GraphEngines = new Map;
class GraphEngine {
  constructor(key, builder) {
    if (GraphEngines.has(key)) throw new Error(
      `Graph Engine ${key} is already registered, can't re-register`);

    this.engineKey = key;
    this.names = builder.names;
    GraphEngines.set(key, this);
  }

  static get(key) {
    if (!GraphEngines.has(key)) throw new Error(
      `Graph Engine ${JSON.stringify(key)} is not registered`);
    return GraphEngines.get(key);
  }

  spawnObject(data) {
    const type = this.names.get(data.type);
    if (!type) throw new Error(
      `Object ${data.objectId} ${JSON.stringify(data.name)
      } has unimplemented type ${JSON.stringify(data.type)}`);
    // TODO: support NodeBuilder extending GraphObjects?
    return new GraphObject(type, data);
  }
}
