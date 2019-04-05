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

  createGraphQuery(query) {
    return new LevelEdgeQuery(this, query);
  }
}

class LevelEdgeQuery extends BaseEdgeQuery {
  /*async*/ fetchEdges() {
    return this.dbCtx.database.rawGraph.get(this.query);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RawLevelStore,
    LevelDataContext,
    LevelEdgeQuery,
  };
}
