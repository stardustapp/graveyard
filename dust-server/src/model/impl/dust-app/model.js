/*
class DustAppRecordSchema extends GraphObject {
  async insert(data) {
    //console.log('inserting', data, this.record);
    const {graphId, objectId} = this.record;
    const recordId = randomString(3);
    const tx = this.graph.db.idb.transaction(['records'], 'readwrite');
    tx.objectStore('records').add({
      graphId, objectId, recordId,
      version: 1,
      data: this.validate(data, 'insert'),
    });
    await tx.complete;
    return recordId;
  }
  validate(data, context) {
    const presentedKeys = new Set(Object.keys(data));
    const output = {};
    for (const key in this.record.config.fields) {
      const config = this.record.config.fields[key];
      presentedKeys.delete(key);
      output[key] = readField(key, data[key], config, context);
    }
    const extraKeys = Array.from(presentedKeys);
    if (extraKeys.length) throw new Error(
      `Received extra keys: ${extraKeys}`);
    return output;
  }
  async getAll() {
    const {graphId, objectId} = this.record;
    const recordId = randomString(3);
    const tx = this.graph.db.idb.transaction(['records'], 'readwrite');
    const data = await tx.objectStore('records').getAll(IDBKeyRange.bound(
      [graphId, objectId, '#'],
      [graphId, objectId, '~']));
    return data;
  }
}
*/

new GraphEngineBuilder('dust-app/v1-beta1', build => {

  build.node('Package', {
    treeRole: 'root',
    fields: {
      PackageKey: String,
      PackageType: { type: String, choices: [ 'Package', 'Library', 'App' ] },
      License: String,
    },
  });

  build.node('AppRouter', {
    treeRole: 'parent',
    fields: {
      IconUrl: { type: String, optional: true },
      DefaultLayout: { reference: 'Template', optional: true },
    },
  });

  build.node('Route', {
    treeRole: 'leaf',
    fields: {
      Path: String,
      Action: {
        anyOfKeyed: {
          Script: { fields: {
            Coffee: String,
            JS: String,
            Refs: { reference: true, isList: true },
          }},
          Render: { fields: {
            Template: {
              reference: 'Template',
            },
          }},
        },
      },
    },
  });

  build.node('Template', {
    treeRole: 'leaf',
    fields: {
      Handlebars: String,
      Style: { fields: {
        CSS: String,
        SCSS: String,
      }},
      // TODO: map of scripts
      Scripts: { isList: true, fields: {
        Type: { anyOfKeyed: {
          Lifecycle: { type: String, choices: [ 'Render', 'Create', 'Destroy' ] },
          Helper: { type: String },
          Event: { type: String },
          Hook: { type: String },
        }},
        Coffee: String,
        JS: String,
        Refs: { reference: true, isList: true },
      }},
    },
  });

  const RecordField = {
    Key: String,
    Type: { anyOfKeyed: {
      BuiltIn: { type: String, choices: [
        'String', 'URI', 'Secret', 'Number', 'Boolean', 'Moment', 'Object', 'Graph', 'Reference'
      ]},
      SchemaEmbed: { reference: 'RecordSchema' },
      SchemaRef: { reference: 'RecordSchema' },
    }},
    IsList: { type: Boolean, default: false },
    Optional: { type: Boolean, default: false },
    Immutable: { type: Boolean, default: false },
    DefaultValue: { type: String, optional: true }, // TODO: as [E]JSON string
    // TODO: enum, transient, mapping
  };

  build.node('RecordSchema', { // was CustomRecord
    treeRole: 'leaf',
    fields: {
      Base: { anyOfKeyed: {
        BuiltIn: { type: String, choices: [ 'Record', 'Class' ]},
        SchemaRef: { reference: 'RecordSchema' },
      }},
      Fields: { fields: RecordField, isList: true },
      // Behaviors
      TimestampBehavior: { type: Boolean, default: false },
      SlugBehavior: { optional: true, fields: {
        Field: String,
      }},
    },
  });

  build.node('Dependency', {
    treeRole: 'parent',
    fields: {
      PackageKey: { type: String, optional: false },
      ChildRoot: { reference: 'Package', optional: false },
    },
  });

  const DocLocator = {
    RecordType: { anyOfKeyed: {
      BuiltIn: { type: String, choices: [ 'Record', 'Class' ]},
      SchemaRef: { reference: 'RecordSchema' },
    }},
    FilterBy: { type: String, optional: true },
    SortBy: { type: String, optional: true },
    Fields: { type: String, optional: true },
    LimitTo: { type: Number, optional: true },
    //Children: { embed: '@' }, // self recursion
  };
  // recursive field just to make things difficult
  DocLocator.Children = { fields: DocLocator, isList: true };

  build.node('Publication', {
    treeRole: 'leaf',
    fields: DocLocator,
  });

  build.node('ServerMethod', {
    treeRole: 'leaf',
    fields: {
      Coffee: String,
      JS: String,
      Refs: { reference: true, isList: true },
    },
  });

}).install();