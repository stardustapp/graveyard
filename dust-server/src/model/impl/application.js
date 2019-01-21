
class BaseObject {
  constructor(graph, record) {
    this.graph = graph;
    this.record = record;
  }
}

const OBJECT_TYPES = {
  'external-script': class ExternalScriptObject extends BaseObject {
    constructor(graph, record) {
      super(graph, record);
    }
  },
  'dust-app': class WebBundleObject extends BaseObject {
    constructor(graph, record) {
      super(graph, record);
    }
  },
  'collection': class CollectionObject extends BaseObject {
    constructor(graph, record) {
      super(graph, record);
    }
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
  },

  'record-publication': class DocumentPublicationObject extends BaseObject {
    constructor(graph, record) {
      super(graph, record);
      //console.log('created record-publication', record);
    }
  },

  'blaze-component': class BlazeComponentObject extends BaseObject {
    constructor(graph, record) {
      super(graph, record);
      //console.log('created blaze-component', record);
    }
  },
};

class S3ApplicationRepository {
  constructor() {
    //AWS.config.region = 'us-east-1';
    this.bucket = new AWS.S3({
      region: 'us-west-2',
      accessKeyId: 'AKIAIFCYEL4GIQUUPLIQ',
      secretAccessKey: '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',
      params: {
        Bucket: 'stardust-repo',
      },
    });
  }
  async listPackages() {
    const {IsTruncated, Contents} = await this.bucket.
      makeUnauthenticatedRequest('listObjectsV2', {
        Delimiter: '/',
        Prefix: 'packages/',
      }).promise();

    if (IsTruncated) throw new Error(`truncated:
      More than like 500 packages seen`);

    return Contents
      .filter(({Key}) => Key
        .endsWith('.meta.json'))
      .map(obj => ({
        packageId: obj.Key.slice(9, -10),
        updatedAt: obj.LastModified,
      }));
  }
  async getPackageMeta(packageId) {
    const {Body} = await this.bucket
      .makeUnauthenticatedRequest('getObject', {
        Key: `packages/${packageId}.meta.json`,
      }).promise();
    return JSON.parse(Body);
  }
  async fetchPackage(packageId) {
    console.info('Fetching package contents for', packageId);
    const resp = await this.bucket.
      makeUnauthenticatedRequest('getObject', {
        Key: `packages/${packageId}.json`,
      }).promise();
    console.log()

    console.debug('Parsing package');
    const pkg = JSON.parse(resp.Body);
    pkg._originalVersion = pkg._version;
    // insert upgrade code here
    if (pkg._version !== 3) throw new Error(`unsupported-version:
      This package is built for a newer or incompatible version of Stardust (${pkg._version})`);
    return pkg;
  }
}

async function ImportLegacyStardustApplication(db, manifest) {
  if (manifest._platform !== 'stardust') throw new Error(
    'invalid stardust manifest');

  const graph = await db.createGraph({
    forceId: manifest.packageId,
    fields: {
      Type: {'App': 'Application'}[manifest.meta.type],
      Name: manifest.meta.name,
      License: manifest.meta.license,
      IconUrl: manifest.meta.iconUrl,
    },
    objects: manifest.resources.map(resource => {
      switch (resource.type) {
        case 'RouteTable':
          return {
            name: {'RootRoutes': 'Application'}[resource.name] || resource.name,
            type: 'dust-app',
            version: resource.version,
            defaultLegacyLayoutId: resource.layout,
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
          };
        case 'CustomRecord':
          const fields = {};
          for (const field of resource.fields) {
            fields[field.key] = {
              type: field.type.replace(':', '/'),
              isList: !!field.isList,
              required: !field.optional,
              mutable: !field.immutable,
              defaultValue: field.defaultValue,
            };
          }
          if (resource.timestamp) {
            fields.createdAt = {type: 'core/timestamp', insertionDefault: 'now'};
            fields.updatedAt = {type: 'core/timestamp', updateDefault: 'now'};
          }
          return {
            name: resource.name,
            //type: (resource.base === 'core:Record') ? 'collection' : resource.base, // TODO
            type: 'collection',
            version: resource.version,
            base: resource.base,
            fields,
          };
        case 'Template':
          return {
            name: resource.name,
            type: 'blaze-component',
            version: resource.version,
            template: resource.html,
            style: {
              scss: resource.scss,
              css: resource.css,
            },
            scripts: resource.scripts.map(script => {
              script.type = ['on-render', 'on-create', 'on-destroy', 'helper', 'event', 'hook'][script.type];
              return script;
            })
          };
        case 'ServerMethod':
          return {
            name: resource.name,
            type: 'external-script',
            version: resource.version,
            engine: 'meteor',
            sourceText: {
              coffee: resource.coffee,
              js: resource.js,
            },
            injects: resource.injects,
          };
        case 'Publication':
          return {
            name: resource.name,
            type: 'record-publication',
            version: resource.version,
            children: resource.children,
            fields: resource.fields,
            filterBy: resource.filterBy,
            limitTo: resource.limitTo,
            recordType: resource.recordType,
            sortBy: resource.sortBy,
          };
        default:
          console.warn('Skipping', resource.type, resource.name, resource);
          return false;
      }
    }).filter(x => x),
  });
  console.debug('Created graph:', graph);
}