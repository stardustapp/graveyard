class BaseRawStore {
  constructor(engine) {
    this.engine = engine;
    this.eventProcessors = new Array;

    this.typeProxies = new Map;
    for (const name of engine.names.values()) {
      this.typeProxies.set(name.name, new NodeProxyHandler(name));
    }

    this.mutex = new RunnableMutex(this.transactNow.bind(this));
  }

  static async openGraphWorld(...args) {
    const engine = GraphEngine.get('graph-store/v1-beta1');
    const {lifecycle} = engine.extensions;

    const storeImpl = await this.open(engine, ...args);
    return await lifecycle.createFrom(storeImpl);
  }

  // user entrypoint that either runs immediately or queues for later
  transact(mode, cb) {
    return this.mutex.submit(mode, cb);
  }

  // mutex entrypoint that just goes for it
  transactNow(mode, cb) {
    const dbCtx = this.createDataContext(mode);
    return dbCtx.runCb(cb);
  }

  // write a new top in forcibly
  async replaceTop(topData) {
    const topRelation = Array
      .from(this.engine.edges)
      .find(x => x.type === 'Top');

    const type = topRelation.topType;
    const proxyHandler = new NodeProxyHandler(type);
    const topObj = await this.transact('write top', async dbCtx => {
      const rootNode = proxyHandler.wrap(dbCtx, 'top', type.name, topData);
      const rootObj = this.engine.spawnObject(rootNode, type);
      await dbCtx.storeNode(rootObj);
      return rootObj;
    });
    topObj.storeImpl = this; // TODO: better way?
    return topObj;
  }

  async processDbActions(dbCtx, actions) {
    const nodeMap = new Map;
    const nodeLists = new Proxy(nodeMap, {
      get(target, prop, receiver) {
        if (!target.has(prop)) {
          const [type, nodeId] = prop.split('#');
          target.set(prop, {
            nodeType: type,
            nodeId: nodeId,
            actions: new Array,
          });
        }
        return target.get(prop);
      },
    });

    for (const action of actions) {
      switch (action.kind) {
        case 'put node':
        case 'del node':
          const {nodeId, typeName} = action.proxyTarget;
          nodeLists[`${typeName}#${nodeId}`].actions.push(action);
          break;
        case 'put edge':
        case 'del edge':
          const {subject, object} = action.record;
          nodeLists[subject].actions.push({ direction: 'out', ...action });
          nodeLists[object].actions.push({ direction: 'in', ...action });
          break;
      }
    }

    const event = {
      kind: 'put graph',
      nodeMap,
      rootNodeId: 'Instance#top', // TODO!!
      timestamp: new Date,
    };
    Object.defineProperty(event, 'dbCtx', {
      enumerable: false,
      value: dbCtx,
    });

    for (const processor of this.eventProcessors) {
      await processor(event);
    }
  }
}

class BaseRawContext {
  constructor(graphStore, mode) {
    this.graphStore = graphStore;
    this.database = graphStore.database;
    this.mode = mode;

    this.actions = new Array;
    this.actionProcessors = new Array;

    this.objProxies = new Map;
  }

  async runCb(cb) {
    try {
      console.group(this.constructor.name, 'start:', this.mode);
      const result = await cb(this);
      await this.flushActions();
      return result;
    } catch (err) {
      console.warn(this.constructor.name, 'failed:', err.message);
      throw err;
    } finally {
      console.groupEnd();
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

    const data = await this.loadNodeById(nodeId); // from raw impl
    const obj = this.wrapRawNode(nodeId, data);

    this.objProxies.set(nodeId, obj);
    return obj;
  }

  wrapRawNode(nodeId, {type, fields}) {
    const proxyHandler = this.graphStore.typeProxies.get(type);
    if (!proxyHandler) throw new Error(
      `Didn't find a proxy handler for type ${type}`);

    return proxyHandler.wrap(this, nodeId, type, fields);
  }

  async storeNode(node) {
    // TODO: something else does this too
    if (GraphObject.prototype.isPrototypeOf(node)) {
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

  async newNode(type, fields) {
    //console.log('hi!!!!!', type, fields);
    const proxyHandler = this.graphStore.typeProxies.get(type.name);
    if (!proxyHandler) throw new Error(
      `Didn't find a proxy handler for type ${type.name}`);

    const nodeId = randomString(3); // TODO: check for uniqueness
    const obj = proxyHandler.wrap(this, nodeId, type.name, fields, true);
    this.objProxies.set(nodeId, obj);
    return obj;
  }

  async newEdge({subject, predicate, object}, origRelation) {
    if (!subject || !subject.nodeId) throw new Error(
      `newEdge() requires a valid, ID'd subject`);
    if (!object || !object.nodeId) throw new Error(
      `newEdge() requires a valid, ID'd object`);

    const record = {
      subject: `${subject.typeName}#${subject.nodeId}`,
      predicate,
      object: `${object.typeName}#${object.nodeId}`,
    };
    this.actions.push({
      kind: 'put edge',
      record,
    });

    // TODO: support uniqueBy by adding name to index
    // TODO: support count constraints
    // TODO: look up the opposite relation for constraints
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

  queryGraph(query) {
    if (query.subject && query.subject.constructor === NodeProxyHandler)
      query.subject = `${query.subject.typeName}#${query.subject.nodeId}`;
    if (query.object && query.object.constructor === NodeProxyHandler)
      query.object = `${query.object.typeName}#${query.object.nodeId}`;

    if (query.subject && query.subject.constructor === GraphObject)
      throw new Error(`GraphObject as subject`);
    if (query.object && query.object.constructor === GraphObject)
      throw new Error(`GraphObject as object`);

    return this.createGraphQuery(query);
  }
}

class BaseEdgeQuery {
  constructor(dbCtx, query, stages=[]) {
    this.dbCtx = dbCtx;
    this.query = query;
    this.stages = stages;
    console.log('building graph query for', query);
  }

  async fetchAll() {
    const edges = await this.fetchEdges();
    const promises = edges.map(async raw => ({
      subject: await this.dbCtx.getNodeById(raw.subject.split('#')[1]),
      predicate: raw.predicate,
      object: await this.dbCtx.getNodeById(raw.object.split('#')[1]),
    }));
    return await Promise.all(promises);
  }
  async fetchSubjects() {
    const edges = await this.fetchEdges();
    return await Promise.all(edges
      .map(raw => raw.subject.split('#')[1])
      .map(raw => this.dbCtx.getNodeById(raw)));
    }
  async fetchObjects() {
    const edges = await this.fetchEdges();
    return await Promise.all(edges
      .map(raw => raw.object.split('#')[1])
      .map(raw => this.dbCtx.getNodeById(raw)));
    }

  async findOne(filter) {
    const edges = await this.fetchAll();
    for (const edge of edges) {
      let isMatch = true;
      for (const key in filter) {
        if (edge.object[key] !== filter[key])
          isMatch = false;
      }
      if (isMatch) return edge.object;
    }
    throw new Error(`No matching edge found`);
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    BaseRawStore,
    BaseRawContext,
    BaseEdgeQuery,
  };
}
