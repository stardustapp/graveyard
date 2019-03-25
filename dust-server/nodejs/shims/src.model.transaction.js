class GraphTxn {
  constructor(graphStore, txn) {
    throw new Error('TODO: GraphTxn construction');
  }
}

class DataContext {
  constructor(graphStore, mode, cb) {
    this.graphStore = graphStore;
    this.database = graphStore.database;
    this.mode = mode;

    this.actions = new Array;
    this.actionProcessors = new Array;

    this.objProxies = new Map;
  }
  abort() {
    console.log('TODO: abort DataContext');
  }
  async runCb(cb) {
    try {
      console.group('DataContext start:', this.mode);
      const result = await cb(this);
      const batches = this.generateBatch();
      if (batches.length > 0) {
        console.debug('Processing transaction actions...');

        for (const processor of this.actionProcessors) {
          await processor(this, this.actions);
        }

        await this.database.rawLevel.batch(batches);
        console.log('\r  --> Applied', batches.length, 'database ops',
          'from', this.actions.length, 'graph ops.');
      }
      return result;
    } catch (err) {
      console.warn('DataContext failed:', err.message);
      throw err;
    } finally {
      console.groupEnd();
    }
  }

  generateBatch() {
    //console.debug('TODO: actions taken:', this.actions);
    const batch = new Array;
    for (const action of this.actions) {
      switch (action.kind) {

        case 'put edge':
          const subBatch = this.graphStore.database.rawGraph.generateBatch(action.record);
          for (const subItem of subBatch) {
            batch.push(subItem);
          }
          break;

        case 'put node':
          const json = JSON.stringify({
            type: action.proxyTarget.typeName,
            fields: action.proxyTarget.fields,
          });
          batch.push({type: 'put', key: 'doc::'+action.proxyTarget.nodeId, value: json});
          break;

        default:
          console.log('unimpl action', action.kind);
          throw new Error(`weird action '${action.kind}'`);
      }
    }
    return batch;
  }

  getNode(handle) {
    if (handle.constructor !== GraphObject) throw new Error(
      `TODO: getNode() for non-GraphObject nodes`);
    if (!handle.data.nodeId) throw new Error(
      `TODO: getNode() for GraphObject without an nodeId`);
    return this.getNodeById(handle.data.nodeId);
  }

  // TODO: refactor as caching loader
  async getNodeById(nodeId) {
    if (this.objProxies.has(nodeId))
      return this.objProxies.get(nodeId);

    const docJson = await this.database.rawLevel.get('doc::'+nodeId);
    const {type, fields} = JSON.parse(docJson);
    const proxyHandler = this.graphStore.typeProxies.get(type);
    if (!proxyHandler) throw new Error(
      `Didn't find a proxy handler for type ${type}`);

    const obj = proxyHandler.wrap(this, nodeId, type, fields);
    this.objProxies.set(nodeId, obj);
    return obj;
  }

  async storeNode(node) {
    // TODO: something else does this too
    if (node.constructor === GraphObject) {
      const json = JSON.stringify({
        type: node.type.name,
        fields: node.data,
      });
      //console.log('wrote json', json);
      await this.database.rawLevel.put('doc::'+node.data.nodeId, json);
      return this.getNodeById(node.data.nodeId);
    } else {
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
    //console.log('CReATING', graphNode, '--WITH--', rootNode);

    //throw new Error('come back later')

    const nodes = [];
    function addNode(node) {
      nodes.push(node);
      if (node.names) {
        Array
          .from(node.names.values())
          .forEach(addNode);
      }
    }
    addNode(rootNode);
    return this.createObjects(graphNode, nodes);
  }

  async createObjects(graphNode, objects) {
    if (!objects.every(x => x))
      throw new Error(`createObjects() was given falsey object`);
    if (!objects.every(x => x.constructor === GraphBuilderNode))
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

    return new GraphEdgeQuery(this, query);
    /*
    const edges = await this.database.rawGraph.get(query);
    const promises = edges.map(async raw => ({
      subject: await this.getObjectById(raw.subject),
      predicate: raw.predicate,
      object: await this.getObjectById(raw.object),
    }));
    return Promise.all(promises);
    */
  }
}

class GraphEdgeQuery {
  constructor(dbCtx, query, stages=[]) {
    this.dbCtx = dbCtx;
    this.query = query;
    this.stages = stages;
    console.log('building graph query for', query)
  }

  /*async*/ fetchEdges() {
    return this.dbCtx.database.rawGraph.get(this.query);
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
    const edges = await this.dbCtx.database.rawGraph.get(this.query);
    for (const edge of edges) {
      console.warn('FILTER');
    }
    console.log('DONE FILTER');
  }
}

/*
class NodeProxy {
  constructor(ctx, objId, realData) {
    let realDoc = null;
    let rootDoc = null;

    console.log('MAKING PROXY', objId, realData);

    realDoc = realData;
    rootDoc = new DocProxy(this, realData);

    Object.defineProperty(this, 'objectId', {
      enumerable: true,
      value: objId,
    });

    Object.defineProperty(this, 'doc', {
      enumerable: true,
      get() { return rootDoc; },
      set(newDoc) {
        if (!isReady) throw new Error(
          `Can't set new doc, object isn't ready`);
        if (rootDoc) throw new Error(
          `Can't set new doc, there already is one`);
        rootDoc = DocProxy.fromEmpty(this, newDoc);
      },
    });

    Object.defineProperty(this, 'unsavedBatch', {
      enumerable: false,
      get() {
        if (!isReady) throw new Error(
          `Can't generate unsavedBatch when not ready yet`);
        const batch = new Array;

        if (!realDoc && rootDoc) {
          // CREATION
          batch.push({type:'put', key:`!docs!${objId}`, value:rootDoc.asJsonable});
        }

        return batch;
      },
    });
  }
}

class DocProxy {
  constructor(dataObj, prevData) {
  }

  // Constructs a proxy of the given data,
  // where every field is considered dirty
  static fromEmpty(dataObj, newData) {
    const dataKeys = Object.keys(newData);
    const emptyObj = {};
    for (const key of dataKeys) {
      emptyObj[key] = null;
    }

    const rootDoc = new DocProxy(dataObj, emptyObj);
    for (const key of dataKeys) {
      rootDoc[key] = newData[key];
    }

    return rootDoc;
  }
}
*/


/*
class GraphTxn {
  constructor(graphStore) {
    this.graphStore = graphStore;

    this.currentDate = new Date;
    this.actions = new Map;
  }

  _addAction(graphId, ...actions) {
    if (!this.actions) {
      console.warn('Prior finish call:', this.finishStack)
      throw new Error(`DESYNC: GraphTxn use-after-completion`);
    }
    if (!this.actions.has(graphId)) {
      this.actions.set(graphId, new Array);
    }

    const entries = this.actions.get(graphId);
    actions.forEach(x => entries.push(x));
  }

  _onComplete() {
    if (this.actions) {
      console.warn(`DESYNC: GraphTxn didn't have a chance to commit its actions`, this.actions);
      throw new Error(`DESYNC: No GraphTxn Completion`);
    }
  }

  _onError(err) {
    // error is null if aborted
    if (err) console.error(
      `GraphTxn failed:`, err.constructor, err.code, err.name);
  }

  abort() {
    console.warn('TODO: implement GraphTxn#abort');
  }


  async purgeGraph(graphId) {
    const ops = [
      this.txn.objectStore('graphs').delete(graphId),
      this.txn.objectStore('events').delete(IDBKeyRange.bound([graphId, new Date(0)], [graphId, new Date(1e13)])),
    ];

    const objStore = this.txn.objectStore('objects');
    const recStore = this.txn.objectStore('records');

    const objIds = await objStore
      .index('by graph').getAllKeys(graphId);
    if (!objIds.length) return;
    console.warn('Objects to delete:', objIds);

    const brokenObjIds = new Set;
    for (const objectId of objIds) {
      const depObjIds = await objStore.index('referenced').getAllKeys(objectId);
      depObjIds
        .filter(x => !objIds.includes(x))
        .filter(x => !brokenObjIds.has(x))
        .forEach(depId => {
          console.warn('Breaking object reference from', depId, 'to', objId);
          brokenObjIds.add(depId);
        });

      ops.push(
        objStore.delete(objectId),
        recStore.delete(IDBKeyRange.bound([objectId, '#'], [objectId, '~'])),
      );
    }
    console.log('Deleted', objIds.length, 'objects, breaking', brokenObjIds.size, 'other objects')

    await Promise.all(ops);
    this._addAction(graphId, {
      type: 'delete graph',
    });
  }

  async purgeEverything() {
    await this.txn.objectStore('graphs').clear();
    await this.txn.objectStore('objects').clear();
    await this.txn.objectStore('records').clear();
    await this.txn.objectStore('events').clear();

    this._addAction(null, {
      type: 'delete everything',
    });
  }

  async createGraph(options={}) {
    const graphId = options.forceId || randomString(3);

    // check for conflict
    const existingDoc = await this.txn.objectStore('graphs').get(graphId);
    if (existingDoc) throw new Error(
      `Graph ID '${graphId}' already exists`);
    // TODO: check for existing objects

    // write out the graph itself
    const record = {
      graphId,
      version: 1,
      engine: options.engine.engineKey,
      fields: options.fields,
      createdAt: this.currentDate,
      updatedAt: this.currentDate,
    };
    await this.txn.objectStore('graphs').add(record);

    // seed the events
    this._addAction(graphId, {
      type: 'create graph',
      data: record,
    });

    return graphId;
  }

  async replaceFields(objectId, version, newFields) {
    const object = this.txn.objectStore('objects').get(objectId);
    const {graphId} = object.data;

    if (object.data.version !== version) throw new Error(
      `CONFLICT: You committed from version ${field.version}, but version ${object.data.version} is latest`);
    version += 1;

    this._addAction(graphId, {
      type: 'replace object fields',
      graphId, objectId, version,
      fields: newFields,
    });
  }
}
*/

if (typeof module !== 'undefined') {
  module.exports = {
    DataContext,
    GraphTxn,
  };
}
