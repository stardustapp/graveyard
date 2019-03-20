class GraphTxn {
  constructor(graphStore, txn) {
    this.graphStore = graphStore;
    this.txn = txn;

    this.currentDate = new Date;
    this.graphActions = new Map;

    txn.complete.then(
      this._onComplete.bind(this),
      this._onError.bind(this));
  }

  _addAction(graphId, ...actions) {
    if (!this.graphActions) {
      console.warn('Prior finish call:', this.finishStack)
      throw new Error(`DESYNC: GraphTxn use-after-completion`);
    }
    if (!this.graphActions.has(graphId)) {
      this.graphActions.set(graphId, new Array);
    }

    const entries = this.graphActions.get(graphId);
    actions.forEach(x => entries.push(x));
  }

  _onComplete() {
    if (this.graphActions) {
      console.warn(`DESYNC: GraphTxn didn't have a chance to commit its actions`, this.graphActions);
      throw new Error(`DESYNC: No GraphTxn Completion`);
    }
  }

  _onError(err) {
    // error is null if aborted
    if (err) console.error(
      `GraphTxn failed:`, err.constructor, err.code, err.name);
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

  async createObjectTree(graphId, rootNode) {
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
    return this.createObjects(graphId, nodes);
  }

  async createObjects(graphId, objects) {
    if (!objects.every(x => x))
      throw new Error(`createObjects() was given falsey object`);
    if (!objects.every(x => x.constructor === GraphBuilderNode))
      throw new Error(`createObjects() was given something other than GraphBuilderNode`);

    const actions = [];
    const readyObjs = new Map;
    const remaining = new Set(objects);

    function prepareObject(object) {
      const objectId = randomString(3);
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
          return target.data.objectId;
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

      const primitives = new Set([String, Date, Array, Boolean, Number, Blob]);
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
        graphId,
        objectId,
        refObjIds: Array.from(refObjIds),
        parentObjId: parent ? readyObjs.get(parent) : null,
        name,
        type,
        version,
        fields: cleanedData,
      };
    }

    let pass = 0;
    while (remaining.size && pass++ < 5) {
      console.group('Object linking pass', pass);
      try {
        let compiled = 0;

        for (const object of objects) {
          if (readyObjs.has(object)) continue;
          const record = prepareObject(object);
          if (!record) continue;

          //console.log('storing', record);
          await this.txn.objectStore('objects').add(record);

          this._addAction(graphId, {
            type: 'create object',
            data: record,
          });

          readyObjs.set(object, record.objectId);
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

  async finish() {
    // create the necesary events
    const events = Array
      .from(this.graphActions.entries())
      .map(([graphId, entries]) => ({
        timestamp: this.currentDate,
        graphId, entries,
      }));
    this.graphActions = null;

    // record a stack trace for debugging txns
    try {
      throw new Error('finishing GraphTxn');
    } catch (err) {
      this.finishStack = err;
    }

    console.log('events:', events);
    // store the events
    const eventStore = this.txn.objectStore('events');
    const ops = events
      .filter(doc => doc.graphId) // ignore runtime global events
      .map(doc => eventStore.add(doc));

    // wait for transaction to actually commit
    await Promise.all(ops);
    await this.txn.complete;

    // pass events into the reactivity engine
    // this is a bad time to fail!
    for (const event of events) {
      try {
        await this.graphStore.processEvent(event);
      } catch (err) {
        console.error(`DESYNC: Event failed to process.`, event, err);
      }
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphTxn,
  };
}
