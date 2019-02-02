class Graph {
  constructor(store, data) {
    this.store = store;
    this.data = data;
    this.engine = GraphEngine.get(data.engine);

    this.objects = new Map;
    this.roots = new Set;
  }

  populateObject(data) {
    if (this.objects.has(data.objectId)) throw new Error(
      `Graph ${this.data.graphId} already has object ${data.objectId}`);
    if (this.store.objects.has(data.objectId)) throw new Error(
      `Graph store already has object ${data.objectId}`);

    const obj = this.engine.spawnObject(data);
    this.objects.set(data.objectId, obj);
    this.store.objects.set(data.objectId, obj);
    if (obj.type.treeRole == 'root') {
      this.roots.add(obj);
    }
  }

  relink() {
    for (const root of this.roots) {
      console.log('relinking', root);
      // TODO
    }
  }
}

/*
  static async load(db, graphId) {
    const tx = await db.idb
      .transaction(['graphs', 'objects']);
    const record = await tx
      .objectStore('graphs')
      .get(graphId);
    if (!record) throw new Error(`graph-missing:
      Graph '${graphId}' not found.`);
    const objects = await tx
      .objectStore('objects')
      .getAll(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
      //.index('graphId').getAll(graphId);
    return new Graph(db, record, objects);
  }

  constructor(db, record, objects) {
    this.db = db;
    this.record = record;

    this.objects = new Map;
    for (const object of objects) {
      this.loadObjectFromRecord(object);
    }
  }

  async createObject(config) {
    if (!config) throw new Error(`Null object config given`);
    const {graphId} = this.record;
    const tx = this.db.idb.transaction(
        ['objects', 'events'], 'readwrite');

    // check for name conflicts
    if (config.name) {
      const allObjects = await tx
        .objectStore('objects')
        .getAll(IDBKeyRange.bound([graphId, '#'], [graphId, '~']));
      if (allObjects.find(obj => obj.config.name === config.name))
        throw new Error(`An object named '${config.name}' already exists in this graph`);
    }

    const objectId = randomString(3);
    const record = {
      graphId,
      objectId,
      version: 1,
      config,
    };
    tx.objectStore('objects').add(record);
    tx.objectStore('events').add({
      graphId,
      timestamp: new Date,
      entries: [{
        type: 'create object',
        objectId,
        version: 1,
        config,
      }],
    });

    // finish it out
    await tx.complete;
    return await this.loadObjectFromRecord(record);
  }

  loadObjectFromRecord(record) {
    //console.log('config', record);
    if (this.objects.has(record.objectId)) throw new Error(
      `Object ${record.objectId} is already loaded`);
    const objClass = OBJECT_TYPES[record.config.type];
    if (!objClass) throw new Error(
      `Object type '${record.config.type}' not found`);
    const object = new objClass(this, record);
    this.objects.set(record.objectId, object);
    return object;
  }
}

function readField(key, input, config, context) {
  const {type, required, choices} = config;
  if (input == null && context === 'insert' && 'insertionDefault' in config) {
    input = config['insertionDefault'];
  }
  if (context === 'update' && 'updateDefault' in config) {
    input = config['updateDefault'];
  }
  if (input == null && required !== false) {
    throw new Error(`Field '${key}' is required, but was null`);
  }
  if (input != null) {
    //console.log('key', key, input, config);
    switch (config.type) {
      case 'core/timestamp':
        if (input === 'now') return new Date;
        if (input.constructor !== Date) throw new Error(
          `Date field '${key}' not recognized`);
        break;
      case 'core/string':
        if (input.constructor !== String) throw new Error(
          `String field '${key}' not recognized`);
        break;
      default:
        throw new Error(`'${config.type}' field '${key}' not recognized`);
    }
    if (config.choices) {
      if (!config.choices.includes(input)) throw new Error(
        `Field '${key}' must be one of ${config.choices} but was '${input}'`);
    }
    return input;
  }
  return null;
}
*/