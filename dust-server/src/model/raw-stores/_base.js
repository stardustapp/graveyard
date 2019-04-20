class BaseRawStore {
  constructor(opts) {
    console.log('creating raw store with options', Object.keys(opts));
    this.engine = opts.engine || GraphEngine.get(opts.engineKey);

    this.eventProcessors = new Array;

    this.accessors = new Map;
    for (const name of this.engine.names.values()) {
      this.accessors.set(name.name, FieldAccessor.forType(name));
    }
    //console.log('Raw store accessors:', this.accessors);

    this.topType = Array
      .from(this.engine.edges)
      .find(x => x.constructor === TopRelationBuilder)
      .topType;

    this.mutex = new RunnableMutex(this.transactNow.bind(this));

    this.rootContext = new GraphContext({
      engine: this.engine,
      txnSource: this.transact.bind(this),
      actionSink: this.processAction.bind(this),
    });
  }

  // user entrypoint that either runs immediately or queues for later
  transact(mode, cb) {
    return this.mutex.submit(mode, cb);
  }

  // mutex entrypoint that just goes for it
  async transactNow(mode, cb) {
    const dbCtx = this.createDataContext(mode);
    //const graphCtx = new GraphContext(this.engine);
    const output = await dbCtx.runCb(cb);
    await this.rootContext.flushNodes(dbCtx);
    return output;
  }

  static async newFromImpl(storeImpl, opts={}) {
    const rawStore = new storeImpl(opts);
    await rawStore.transact('newFromImpl', async dbCtx => {
      const topAccessor = FieldAccessor.forType(rawStore.topType);
      await rawStore.rootContext.putNode(topAccessor, opts.topData || {}, 'top');
    });
    return rawStore;
  }

  getTopNode() {
    return this
      .transact('readonly', dbCtx => dbCtx
        .getNodeById('top'));
  }
}

class BaseRawContext {
  constructor(graphStore, mode) {
    this.graphStore = graphStore;
    this.mode = mode;

    this.actions = new Array;
    this.graphContexts = new Set;
    this.actionProcessors = new Array;

    this.objProxies = new Map;
  }

  async runCb(cb) {
    try {
      console.group('-', this.constructor.name, 'start:', this.mode);
      const result = await cb(this);
      this.buildActions();
      await this.flushActions();
      return result;
    } catch (err) {
      console.warn(this.constructor.name, 'failed:', err.message);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  buildActions() {
    for (const graphCtx of this.graphContexts) {
      graphCtx.flushActions();
    }
  }

  getNode(handle) {
    if (!GraphObject.prototype.isPrototypeOf(handle)) throw new Error(
      `TODO: getNode() for non-GraphObject node ${handle.constructor.name}`);
    if (!handle.data.nodeId) throw new Error(
      `TODO: getNode() for GraphObject without an nodeId`);
    return this.getNodeById(handle.data.nodeId);
  }

  // TODO: refactor as caching loader?
  async getNodeById(nodeId) {
    if (this.objProxies.has(nodeId))
      return this.objProxies.get(nodeId);

    const record = await this.loadNodeById(nodeId); // from raw impl
    const accessor = this.graphStore.accessors.get(record.type);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${record.type}`);

    const obj = new GraphNode(this.graphStore.rootContext, nodeId, record.type);
    return accessor.mapOut({nodeId, ...record}, this.graphStore.rootContext, obj);

    if (this.objProxies.has(nodeId))
      console.warn(`WARN: objProxies load race! for`, nodeId);
    this.objProxies.set(nodeId, obj);

    obj.ready = Promise.resolve(obj);
    return obj;
  }

  async loadNodeData(node) {
    const accessor = this.graphStore.accessors.get(node.nodeType);
    if (!accessor) throw new Error(
      `Didn't find an accessor for type ${node.nodeType}`);

    //const obj = new GraphNode(this.graphStore.rootContext, node.nodeId, node.nodeType);
    const record = await this.loadNodeById(node.nodeId)
    accessor.mapOut({nodeId, ...record}, this.graphStore.rootContext, record);

    if (this.objProxies.has(node.nodeId))
      console.warn(`WARN: objProxies load race! for`, node.nodeId);
    this.objProxies.set(node.nodeId, record);
    return record;
  }

  // TODO: delete
  async storeGraphObject(object) {
    // TODO: something else does this too
    if (GraphObject.prototype.isPrototypeOf(node)) {
      const accessor = FieldAccessor.forType(node.type);
      return this.graphStore.rootContext.putNode(accessor, node.data, node.data.nodeId);

      await this.writeNode(node.data.nodeId, {
        type: node.type.name,
        fields: node.data,
      });
      return this.getNodeById(node.data.nodeId);
    } else {
      console.log(node);
      throw new Error(`Don't know how to store that node`);
    }
  }

  // TODO: this is LEGACY
  async createObjectTree(graphNode, rootNode) {
    console.log('CReATING', graphNode, '--WITH--', rootNode);

    //throw new Error('come back later')

    const nodes = [];
    function addNode(node) {
      nodes.push(node);
      // TODO: walk out all predicates
        //Array
          //.from(node.names.values())
          //.forEach(addNode);
    }
    addNode(rootNode);
    return this.createObjects(graphNode, nodes);
  }

  async createObjects(graphNode, objects) {
    if (!objects.every(x => x))
      throw new Error(`createObjects() was given falsey object`);
    if (!objects.every(x => x.constructor === NodeProxyHandler))
      throw new Error(`createObjects() was given something other than GraphBuilderNode`);

    const actions = [];
    const readyObjs = new Map;
    const remaining = new Set(objects);

    function prepareObject(object) {
      const {type, parent, name, version, data} = object;

      if (parent) {
        if (!readyObjs.has(parent)) {
          console.info('Object', name, 'is missing its parent', parent);
          return false;
        }
      }

      const refObjIds = new Set;
      const missingRefs = new Set;
      function resolveRef(ref) {
        let {target} = ref;
        if (target.constructor === GraphGhostNode) {
          if (target.parent.names.has(target.childName)) {
            target = target.parent.names.get(target.childName);
          }
        }
        if (target.constructor === GraphBuilderNode) {
          if (readyObjs.has(target)) {
            const objId = readyObjs.get(target);
            refObjIds.add(objId);
            return objId;
          }
        } else if (GraphObject.prototype.isPrototypeOf(target)) {
          return target;
        } else if (target.constructor === String) {
          // TODO: better path resolving strategy
          const newTarget = Array
            .from(readyObjs.entries())
            .find(x => x[0].name === target);
          if (newTarget) {
            const objId = target[1];
            refObjIds.add(objId);
            return objId;
          }
        }

        console.debug('Reference for', ref, 'missing.', target);
        missingRefs.add(ref);
        return false;
      }

      const primitives = new Set([String, Date, Array, Boolean, Number]);
      if (self.Blob) primitives.add(Blob);
      function cleanValue(val) {
        if (val == null) {
          return null;
        } else if (val.constructor === Object) {
          const output = {};
          Object.keys(val).forEach(key => {
            // reserving this shouldn't hurt
            if (key.startsWith('$')) throw new Error(
              `Data keys cannot start with $`);
            output[key] = cleanValue(val[key]);
          });
          return output;
        } else if (val.constructor === Array) {
          return val.map(cleanValue);
        } else if (val.constructor === GraphReference) {
          return resolveRef(val);
        } else if (primitives.has(val.constructor)) {
          return val;
        } else {
          throw new Error(`Object ${name} had data field with ${val.constructor.name} type`);
        }
      }

      const cleanedData = cleanValue(data);
      if (missingRefs.size > 0) {
        console.info('Object', name, 'is missing', missingRefs.size, 'refs.', data);
        return false;
      }

      return {
        refObjIds: Array.from(refObjIds),
        parentObjId: parent ? readyObjs.get(parent) : null,
        name,
        type,
        version,
        fields: cleanedData,
      };
    }

    const topEntry = await this.getNodeById('top');
    const rootEntry = await topEntry.HAS_NAME.newEntry({
      Name: 'app',
    });

    let pass = 0;
    while (remaining.size && pass++ < 5) {
      console.group('Object linking pass', pass);
      try {
        let compiled = 0;

        for (const object of objects) {
          if (readyObjs.has(object)) continue;
          const record = prepareObject(object);
          if (!record) continue;

          console.log('storing', record.objectId, `'${record.name}'`, record.type, 'under graph', graphNode.EngineKey);
          const objNode = await graphNode.BUILT.newObject({
            Name: record.name,
            Type: record.type,
            Version: record.version,
            // TODO: parentObjId, refObjIds
            Fields: record.fields,
          });

          if (record.name) {
            // TODO: find correct node (walk up a HAS_NAME maybe?)
            //const parentEntry = record.parentObjId || rootEntry;
            const parentEntry = rootEntry;
            const entryNode = await parentEntry.HAS_NAME.newEntry({
              Name: record.name,
            });
            await entryNode.POINTS_TO.attachObject(objNode);
          }

          readyObjs.set(object, objNode);
          remaining.delete(object);
          compiled++;
        }

        console.log('Completed', compiled, 'objects in pass', pass);
      } finally {
        console.groupEnd();
      }
    }

    if (remaining.size > 0) throw new Error(
      `${remaining.size} objects failed to link after ${pass} passes.`);

    console.log('Stored', readyObjs.size, 'objects');
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    BaseRawStore,
    BaseRawContext,
  };
}
