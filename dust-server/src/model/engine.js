function randomString(bytes=10) { // 32 for a secret
  const array = new Uint8Array(bytes);
  (crypto.getRandomValues || crypto.randomFillSync).call(crypto, array);
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
  constructor(builder) {
    const {key} = builder;
    if (GraphEngines.has(key)) throw new Error(
      `Graph Engine ${key} is already registered, can't re-register`);

    this.engineKey = key;
    this.names = builder.names;
    this.edges = builder.edges;
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

  spawnObject(data, type=null) {
    const nodeType = type || this.names.get(data.Type);
    if (!nodeType) throw new Error(
      `Object ${data.objectId} ${JSON.stringify(data.Name)
      } has unimplemented type ${JSON.stringify(data.Type)}`);
    return new nodeType.behavior(nodeType, data);
  }

  spawnTop(data) {
    const world = {
      graphs: new Set,
      objects: new Map,
    };

    const graph = new Graph(world, data, this);
    world.graphs.add(graph);

    const topRelation = Array
      .from(this.edges)
      .find(x => x.type === 'Top');

    return graph.populateObject({
      fields: data,
      objectId: 'top',
    }, topRelation.topType);
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    if (depth < 0) {
      return [
        options.stylize('<engine', 'number'),
        options.stylize(this.engineKey, 'special'),
        options.stylize('/>', 'number'),
      ].join(' ');
    }

    let inner = Array.from(this.names.keys()).join(', ');
    if (depth > 0) {
      const {inspect} = require('util');
      const newOptions = Object.assign({}, options, {
        depth: options.depth === null ? null : options.depth - 2,
      });
      const parts = Array.from(this.names.values()).map(node => {
        return `    ${inspect(node, newOptions)}`
          .replace(/\n/g, `\n    `);
      });
      inner = parts.join('\n');
    }

    return [
      [
        options.stylize('<engine', 'number'),
        options.stylize(`key`, 'special'),
        options.stylize(this.engineKey, 'name'),
        options.stylize(`extensions`, 'special'),
        Object.keys(this.extensions).map(ext =>
          options.stylize(`'${ext}'`, 'string')
        ).join(', '),
        options.stylize('>', 'number'),
      ].join(' '),
      inner,
      options.stylize('  </engine>', 'number'),
    ].join('\n');
  }

}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphObject,
    GraphEngine,
    randomString,
  };
}
