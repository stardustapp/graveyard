class AppProfileLocalCollection extends GraphObject {
  constructor(type, data) {
    super(type, data);
    this.storedTypeCache = new LoaderCache(this
      .loadStoredType.bind(this));
  }

  async loadStoredType(typeName=null) {
    // find directly-named schema
    const allSchemas = this.Schemas.map(x => self.gs.objects.get(x));
    const thisSchema = allSchemas.find(x => x.data.name === typeName);
    if (!thisSchema) throw new Error(
      `LocalCollection doesn't have a type named ${JSON.stringify(typeName)}`);

    const records = await self.gs.transact('readonly', txn => {
      return txn.txn
        .objectStore('records').index('by path')
        .getAll(IDBKeyRange.bound(
          `o/${this.data.objectId}/${encodeURIComponent(typeName)}`,
          `o/${this.data.objectId}/${encodeURIComponent(typeName)}\uffff`));
    });
    console.log('records:', records);

    const collection = this;
    return {
      typeName,
      records,
      listeners: new Map,

      schema: thisSchema,
      childTypes: await Promise.all(thisSchema
        .getChildSchemas()
        .map(childSchema => this.storedTypeCache
          .getOne(childSchema.data.name, childSchema.data.name))),

      async create(fields) {
        const recordId = randomString(3);
        const path = ['o',
          collection.data.objectId, typeName, recordId,
        ].map(x => encodeURIComponent(x)).join('/');

        fields.type = this.typeName;
        fields.version = 1;

        await self.gs.transact('readwrite', async txn => {
          await txn.txn.objectStore('records').add({
            objectId: collection.data.objectId,
            // TODO: support slug as path?
            path, recordId, fields,
          });
        }, () => {
          // TODO: allow post-transaction events here
        });

        this.records.push({
          objectId: collection.data.objectId,
          // TODO: support slug as path?
          path, recordId, fields,
        });
        for (const listener of this.listeners.values()) {
          console.debug('invoking listener', listener);
          listener({
            target: this,
            type: 'create',
            path, recordId, fields,
          });
        }
        console.log('invoked', this.listeners.size, 'listeners');

        return { recordId, version: 1 };
      },
      async update(recordId, data) {
        throw new Error(`TODO update()`, this, recordId, data);
      },
      getAll() {
        throw new Error(`TODO getAll()`, this);
      },
      findOne(recordId) {
        throw new Error(`TODO findOne()`, this, recordId);
      },
    };
  }

  // getSchemaStack()
  // getChildSchemas()
  // getPossibleTypes()

  async insert(data) {
    const storedData = await this.storedTypeCache
      .getOne(data.type, data.type);

    // walk schema down to BuiltIns
    const schemaStack = storedData.schema.getSchemaStack();

    // merge the schemas into one
    let timestamps = false;
    let slugField = null;
    let dataFields = new Map;
    for (const schema of schemaStack) {
      console.log('stack:', schema);
      if (schema.TimestampBehavior)
        timestamps = true;
      if (schema.SlugBehavior)
        slugField = schema.SlugBehavior.Field;
      for (const field of schema.Fields)
        dataFields.set(field.Key, field);
    }

    const fields = this.validate(data, Array.from(dataFields.values()), 'insert');

    if (timestamps) {
      fields.createdAt = new Date;
      fields.updatedAt = new Date;
    }
    if (slugField) {
      const src = fields[slugField];
      if (src != null) {
        // TODO: https://github.com/jagi/meteor-astronomy-slug-behavior/blob/v2/lib/behavior/generateSlug.js#L37
        let newSlug = src.toLowerCase();
        newSlug = newSlug.replace(/[^\w\s-]+/g, '');
        newSlug = newSlug.replace(/^\s+|\s+$/g, '');
        newSlug = newSlug.replace(/\s+/g, '-');
        fields.slug = newSlug;
      }
    }

    return storedData.create(fields);
  }

  validate(data, fields, context) {

    function readField(config, input, context) {
      const {Key, Type, Optional, Choices} = config;
      /*
      if (input == null && context === 'insert' && 'insertionDefault' in config) {
        input = config['insertionDefault'];
      }
      if (context === 'update' && 'updateDefault' in config) {
        input = config['updateDefault'];
      }
      */
      if (input == null && Optional !== true) {
        throw new Error(`Field '${Key}' isn't Optional, but was null`);
      }

      // TODO: IsList, Immutable

      if (input != null) {
        //console.log('Key', Key, input, config);
        // TODO: also SchemaRef
        switch (Type.BuiltIn) {
          case 'Date':
            if (input === 'now') return new Date;
            if (input.$date) return new Date(input.$date);
            if (input.constructor !== Date) throw new Error(
              `Date field '${Key}' not recognized`);
            break;
          case 'String':
            if (input.constructor !== String) throw new Error(
              `String field '${Key}' not recognized`);
            break;
          default:
            throw new Error(`'${JSON.stringify(Type)}' field '${Key}' not recognized`);
        }
        /*
        if (config.Choices) {
          if (!config.Choices.includes(input)) throw new Error(
            `Field '${Key}' must be one of ${config.Choices} but was '${input}'`);
        }
        */
        return input;
      }
      return null;
    }

    console.log('validating', data, 'against', fields);
    const presentedKeys = new Set(Object.keys(data));
    presentedKeys.delete('type');
    presentedKeys.delete('version');

    const output = {};
    for (const config of fields) {
      presentedKeys.delete(config.Key);
      output[config.Key] = readField(config, data[config.Key], context);
    }
    const extraKeys = Array.from(presentedKeys);
    if (extraKeys.length) throw new Error(
      `Received extra keys: ${extraKeys}`);
    return output;
  }

/*
  async getAll() {
    return await self.gs.transact('readonly', txn => {
      return txn.txn.objectStore('records')
        .getAll(IDBKeyRange.bound(
          [this.data.objectId, '#'],
          [this.data.objectId, '~']));
    });
  }
*/

  async startSubscription(rootFilter, parameter={}) {
    console.log('Starting subscription', this.data.name, 'with', parameter);

    // unroll children filters, in dependency order (like an encoded DAG)
    // im tired of writing recursive functions
    const allPubs = new Array;
    function unrollPub (filter, parent) {
      allPubs.push({filter, parent});
      for (const child of filter.children) {
        unrollPub(child, filter);
      }
    }
    unrollPub(rootFilter, null);

    // attach all possible type-caches for each pub
    for (const pub of allPubs) {
      pub.types = await Promise.all(pub.filter.sourceSpec
        .types.map(typeName => this.storedTypeCache
          .getOne(typeName, typeName)));
    }

    //return new AppProfileLocalCollectionRecursiveSubscription(this, allPubs)
    return {

      listener(event) {
        const {target, type, path, recordId, fields} = event;
        console.log('listener got event', event);
      },

      sendToDDP(ddp, subId) {
        console.log('sending to DDP:', ddp, 'as', subId);
        this.ddp = ddp;
        this.subId = subId;

        // send each initial batch
        for (const pub of allPubs) {
          console.log('sending filter:', pub);
          for (const type of pub.types) {
            for (const record of type.records) {
              console.log('found record', record);
              ddp.queueResponses({
                msg: 'added',
                collection: 'records',
                id: record.recordId,
                fields: record.fields,
              });
              // TODO: map Date to {$date: +date}
            }
            type.listeners.set(pub, this.listener.bind(pub));
          }
        }

        console.log('LocalCollection subscription is ready.');
        ddp.queueResponses({
          msg: 'ready',
          subs: [subId],
        });

      },
    };
  }

  /*
    this.queueResponses({
      msg: 'added',
      collection: 'records',
      id: doc.id,
      fields: doc.fields,
    });

    //{
    //  msg: 'changed',
    //  collection: 'records',
    //  id: doc.id,
    //  fields: {
    //    version: 5,
    //  }}

    console.log('Database subscription is ready.');
    this.queueResponses({
      msg: 'ready',
      subs: [packet.id],
    });
  */
}

class AppProfileLocalCollectionRecursiveSubscription {
  constructor() {
    
  }
}