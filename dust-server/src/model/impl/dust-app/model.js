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

new GraphEngine('dust-app/v1-beta1', {
  objectTypes: {

    Application: {
      isGraphRoot: true,
      fields: {
        DefaultLayout: {
          $reference: 'BlazeTemplate',
        },
        Routes: {
          list: true,
          fields: {
            Path: String,
            Action: { $anyOfKeyed: {
              CustomAction: String,
              RenderTemplate: {
                $reference: 'BlazeTemplate',
              },
            }},
          },
          typeSwitchedFields: {
          customAction: {
            customAction: 'String',
          },
          template: {

          },
        }},
            routes: resource.entries.map(entry => {
              switch (entry.type) {
                case 'customAction':
                  return {
                    path: entry.path,
                    type: 'inline-script',
                    action: entry.customAction,
                  };
                case 'template':
                  return {
                    path: entry.path,
                    type: 'blaze-template',
                    action: entry.template,
                  };
              }
              throw new Error('no type '+entry.type);
            }),
    },

    RecordSchema: {
      canDependOn: ['RecordSchema'],
      //implementation: DustAppRecordSchema,
    },

    Dependency: {
      canHaveChildren: true,
    },

    Publication: {
      canDependOn: ['RecordSchema'],
    },

    ServerMethod: {
      canDependOn: ['RecordSchema'],
    },

    BlazeTemplate: {

    },

  },
});
