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
      console.log(`DESYNC: GraphTxn didn't have a chance to commit its actions`, this.graphActions);
      throw new Error(`DESYNC: No GraphTxn Completion`);
    }
  }

  _onError(err) {
    console.error(`GraphTxn failed:`, err.constructor, err.code, err.name);
  }


  async purgeGraph(graphId) {
    const ops = [
      this.txn.objectStore('graphs').delete(graphId),
      this.txn.objectStore('events').delete(IDBKeyRange.bound([graphId, '#'], [graphId, '~'])),
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
  }

  async createGraph(options={}) {
    const graphId = options.forceId || randomString(3);

    // check for conflict
    const existingDoc = await this.txn.objectStore('graphs').get(graphId);
    if (existingDoc) throw new Error(
      `Graph ID '${graphId}' already exists`);
    // TODO: check for existing objects

    // write out the graph itself
    await this.txn.objectStore('graphs').add({
      graphId,
      version: 1,
      createdAt: this.currentDate,
      updatedAt: this.currentDate,
      metadata: options.metadata,
    });

    // seed the events
    this._addAction(graphId, {
      type: 'create graph',
    }, {
      type: 'update graph',
      data: {
        version: 1,
        fields: options.metadata,
      },
    });
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

      const refObjIds = new Set;
      const missingRefs = new Set;
      function resolveRef(ref) {
        if (ref.target.constructor === GraphBuilderNode) {
          if (readyObjs.has(ref.target)) {
            const objId = readyObjs.get(ref.target);
            refObjIds.add(objId);
            return objId;
          }
        }

        console.warn('Reference for', ref, 'missing');
        missingRefs.add(ref);
        return false;
      }

      const primitives = new Set([String, Date, Array, Boolean, Blob]);
      function cleanStruct(struct) {
        const output = struct;
        Object.keys(struct).forEach(key => {
          // reserving this shouldn't hurt
          if (key.startsWith('$')) throw new Error(
            `Data keys cannot start with $`);

          const val = struct[key];
          if (val == null) {
            output[key] = null;
          } else if (val.constructor === Object) {
            output[key] = cleanStruct(val);
          } else if (val.constructor === GraphReference) {
            output[key] = resolveRef(val);
          } else if (primitives.has(val.constructor)) {
            output[key] = val;
          } else {
            console.log(key, val.constructor);
            throw new Error(`Object ${name} had data field with ${val.constructor.name} type`);
          }
        });
        return output;
      }
      const cleanedData = cleanStruct(data);


      return {
        graphId,
        objectId,
        refObjIds: Array.from(refObjIds),
        parentObjId: null, // TODO from object.parent
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

          console.log('storing', record);
          await this.txn.objectStore('objects').add(record);

          const action = Object.assign({type: 'create object'}, )
          this._addAction(graphId, {
            type: 'create object',
            data: record,
          });

          readyObjs.set(object, record.objectId);
          remaining.delete(object);
          compiled++;
        }

        console.log('Completed', compiled, 'objects in pass');
      } finally {
        console.groupEnd();
      }
    }

    console.log('Stored', actions.length, 'objects');
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
    const ops = events.map(doc => eventStore.add(doc));

    // wait for transaction to actually commit
    await Promise.all(ops);
    await this.txn.complete;

    // pass events into the reactivity engine
    // this is a bad time to fail!
    for (const event of events) {
      await this.graphStore.processEvent(event);
    }
  }
}
