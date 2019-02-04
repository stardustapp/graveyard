class AppProfileLocalCollection extends GraphObject {
  constructor(type, data) {
    super(type, data);
    console.log('constructing AppProfileLink', data);
  }

  async insert(data) {
    console.log('inserting', data, 'into', this);

    // find directly-named schema
    const allSchemas = this.Schemas.map(x => self.gs.objects.get(x));
    const thisSchema = allSchemas.find(x => x.data.name === data.type);
    if (!thisSchema) throw new Error(
      `Cannot insert record, uses unknown type ${JSON.stringify(data.type)}`);

    // walk schema down to BuiltIns
    const schemaStack = [thisSchema];
    let schemaCursor = thisSchema;
    while (schemaCursor.Base.SchemaRef) {
      schemaCursor = self.gs.objects.get(schemaCursor.Base.SchemaRef);
      schemaStack.unshift(schemaCursor);
    }

    // merge the schemas into one
    let timestamps = false;
    let slugField = null;
    let dataFields = new Map;
    for (const schema of schemaStack) {
      if (schema.TimestampBehavior)
        timestamps = true;
      if (schema.SlugBehavior)
        slugField = schema.SlugBehavior.Field;
      for (const field of schema.Fields)
        dataFields.set(field.Key, field);
    }

    const recordId = randomString(3);
    const fields = this.validate(data, Array.from(dataFields.values()), 'insert');
    fields.type = thisSchema.data.name;
    fields.version = 1;
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

    await self.gs.transact('readwrite', async txn => {
      await txn.txn.objectStore('records').add({
        objectId: this.data.objectId,
        recordId, fields,
      });
    });

    return { recordId, version: 1 };
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

  async getAll() {
    return await self.gs.transact('readonly', txn => {
      return txn.txn.objectStore('records')
        .getAll(IDBKeyRange.bound(
          [this.data.objectId, '#'],
          [this.data.objectId, '~']));
    });
  }
}

new GraphEngineBuilder('app-profile/v1-beta1', build => {

  build.node('Instance', {
    treeRole: 'root',
    fields: {
      IconUrl: { type: String },
      Source: { anyOfKeyed: {
        DustApp: { reference: {
          engine: 'dust-app/v1-beta1',
          type: 'AppRouter',
        }},
      }},
      // more about what push/pull operations should be enabled
      Privacy: { type: String, choices: [
        'private',
        'public read-only',
        'public interactive',
      ]},
    },
  });

  build.node('Link', {
    treeRole: 'leaf',
    fields: {
      Target: { anyOfKeyed: {
        // TODO: LocalTree: { reference: 'LocalTree' },
        LocalCollection: { reference: 'LocalCollection' },
        LegacyDDP: { fields: {
          SocketBaseUrl: String,
          AppId: String,
          Schemas: { reference: {
            engine: 'dust-app/v1-beta1',
            type: 'RecordSchema',
          }, isList: true },
        }},
        /* TODO
        Skylink: { fields: {
          Endpoint: String,
          AuthToken: { type: String, optional: true },
        }},
        */
      }},
    },
  });

  // TODO
  build.node('LocalCollection', {
    treeRole: 'leaf',
    behavior: AppProfileLocalCollection,
    fields: {
      Schemas: { reference: true, isList: true },
    },
  });

  // TODO
  build.node('LocalTree', {
    treeRole: 'leaf',
    fields: {
    },
  });

}).install();
