class GraphStore {
  constructor(engine) {
    this.engine = engine;
    this.eventProcessors = new Array;

    this.typeProxies = new Map;
    for (const name of engine.names.values()) {
      this.typeProxies.set(name.name, new NodeProxyHandler(name));
    }

    this.mutex = new RunnableMutex(this.transactNow.bind(this));
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

if (typeof module !== 'undefined') {
  module.exports = {
    GraphStore,
  };
}
