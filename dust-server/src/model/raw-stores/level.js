class RawLevelStore extends BaseRawStore {
  constructor(engine, database) {
    super(engine);
    this.database = database;
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    const dbCtx = new LevelDataContext(this, mode);
    dbCtx.actionProcessors.push(this.processDbActions.bind(this));
    return dbCtx;
  }

  static async open(engine, dataPath) {
    const serverDb = await ServerDatabase.open(dataPath);
    console.debug('Opened database at', dataPath);
    return new RawLevelStore(engine, serverDb);
  }

  /*
  async close() {
    this.transact('readonly', async txn => {
      clearInterval(this.warnInterval);
      console.warn('Closing IDB');
      const shutdown = this.idb.close();
      this.idb = null;
      await shutdown;
    });
  }
  */
}

class LevelDataContext extends BaseRawContext {
  abort() {
    console.log('TODO: abort LevelDataContext');
  }

  async flushActions() {
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

  async loadNodeById(nodeId) {
    const myErr = new Error();
    try {
      const docJson = await this.database.rawLevel.get('doc::'+nodeId);
      return JSON.parse(docJson); // {type, fields}
    } catch (err) {
      myErr.message = `Encountered ${err.type} loading node '${nodeId}' from RawLevelStore`;
      myErr.status = err.status;
      throw myErr;
    }
  }

  async writeNode(nodeId, data) {
    const json = JSON.stringify(data);
    await this.database.rawLevel.put('doc::'+nodeId, json);
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

    return new LevelEdgeQuery(this, query);
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

class LevelEdgeQuery {
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

if (typeof module !== 'undefined') {
  module.exports = {
    RawLevelStore,
    LevelDataContext,
    LevelEdgeQuery,
  };
}
