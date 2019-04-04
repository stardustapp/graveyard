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
      `TODO: getNode() for non-GraphObject nodes`);
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

}

if (typeof module !== 'undefined') {
  module.exports = {
    BaseRawStore,
    BaseRawContext,
  };
}
