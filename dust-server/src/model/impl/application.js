
class BaseObject {
  constructor(db, record) {
    this.db = db;
    this.record = record;
  }
}

const OBJECT_TYPES = {
  'external-script': class ExternalScriptObject extends BaseObject {
    constructor(db, record) {
      super(db, record);
    }
  },
  'web-bundle': class WebBundleObject extends BaseObject {
    constructor(db, record) {
      super(db, record);
    }
  },
  'collection': class CollectionObject extends BaseObject {
    constructor(db, record) {
      super(db, record);
    }
    async insert(data) {
      //console.log('inserting', data, this.record);
      const {projectId, objectId} = this.record;
      const recordId = randomString(3);
      const tx = this.db.idb.transaction(['records'], 'readwrite');
      tx.objectStore('records').add({
        projectId, objectId, recordId,
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
      const {projectId, objectId} = this.record;
      const recordId = randomString(3);
      const tx = this.db.idb.transaction(['records'], 'readwrite');
      const data = await tx.objectStore('records').getAll(IDBKeyRange.bound(
        [projectId, objectId, '#'],
        [projectId, objectId, '~']));
      return data;
    }
  },

  'web/router': class WebRouterObject extends BaseObject {
    constructor(db, record) {
      super(db, record);
      console.log('created web/router', this);
    }
  },

  'blaze-component': class BlazeComponentObject extends BaseObject {
    constructor(db, record) {
      super(db, record);
      console.log('created blaze-component', this);
    }
  },
};

async function ImportLegacyStardustApplication(db, manifest) {
  if (manifest._platform !== 'stardust') throw 'invalid stardust manifest';

  const project = await db.createProject({
    metadata: {
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
            type: 'web/router',
            version: resource.version,
            //input: {type: 'http/path'},
            defaultLegacyLayoutId: manifest.meta.layoutId,
            //output: {type: 'web/virtual-dom'},
            entries: resource.entries.map(entry => {
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
                    type: 'object-handler',
                    action: `my/${entry.template}.Component`
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
            type: (resource.base === 'core:Record') ? 'collection' : base, // TODO
            version: resource.version,
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
        default:
          console.warn('Skipping', resource.type, resource.name);
          return false;
      }
    }).filter(x => x),
  });
  console.debug('Created project:', project);
/*
      {
        "_isNew": false,
        "type": "Template",
        "name": "PublicFeed",
        "version": 48,
        "html": "{{#each shouts}}\n\t<div class=\"feed-item\">\n    <h5>From the {{FromPlace}} &mdash;</h5>\n\t\t<div class=\"past-shout\">{{Message}}</div>\n    <time datetime={{strDate Time}}>{{strDate Time 'LT'}}</time>\n\t</div>\n{{/each}}",
        "css": ".feed-item {\n  margin: 0.5em 0; }\n\n.feed-item h5 {\n  margin: 0;\n  font-weight: 400;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-transform: uppercase; }\n\n.past-shout {\n  background-color: #FFFCFC;\n  padding: 0.7em 1em 0.5em;\n  border-radius: 10px;\n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.4em;\n  line-height: 1.2;\n  text-transform: uppercase;\n  white-space: pre-line; }\n\n.feed-item time {\n  margin: 0;\n  font-weight: 400;\n  font-size: 0.8em;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-align: right;\n  display: block;\n  text-transform: uppercase; }\n",
        "scss": ".feed-item {\n  margin: 0.5em 0;\n}\n\n.feed-item h5 {\n  margin: 0;\n  font-weight: 400;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-transform: uppercase;\n}\n\n.past-shout {\n  background-color: #FFFCFC;\n  padding: 0.7em 1em 0.5em;\n  border-radius: 10px;\n  \n  font-family: 'Arima Madurai', cursive;\n  font-size: 1.4em;\n  line-height: 1.2;\n  text-transform: uppercase;\n  white-space: pre-line;\n}\n\n.feed-item time {\n  margin: 0;\n  font-weight: 400;\n  font-size: 0.8em;\n  color: #C98A3B;\n  padding: 0.2em 2em;\n  text-align: right;\n  display: block;\n  text-transform: uppercase;\n}\n",
        "scripts": [
          {
            "key": "helper:shouts",
            "type": 3,
            "param": "shouts",
            "coffee": "Shout = DUST.get 'Shout'\n\n() ->\n  Shout.find {},\n    sort: Time: -1\n    limit: 25",
            "js": "(function() {\n  return function() {\n    var Shout;\n    Shout = DUST.get('Shout');\n    return function() {\n      return Shout.find({}, {\n        sort: {\n          Time: -1\n        },\n        limit: 25\n      });\n    };\n  };\n\n}).call();\n"
          },
          {
            "key": "helper:strDate",
            "type": 3,
            "param": "strDate",
            "coffee": "(time, format) ->\n  if format.length\n    moment(time).format(format)\n  else moment(time).toJSON()",
            "js": "(function() {\n  return function() {\n    return function(time, format) {\n      if (format.length) {\n        return moment(time).format(format);\n      } else {\n        return moment(time).toJSON();\n      }\n    };\n  };\n\n}).call();\n"
          }
        ]
      },
      {
        "_isNew": false,
        "type": "Publication",
        "name": "Default",
        "version": 3,
        "recordType": "Shout",
        "filterBy": "{}",
        "sortBy": "{}",
        "fields": null,
        "limitTo": null,
        "children": []
      }
    ]
  });

  // create a new shout
  const shoutHandle = await project
    .get('my/shout.collection')
    .insert({
      Message: 'is this thing on',
      FromPlace: 'rooftops',
    });

  // retrieve the shout and check fields
  const shout = await project
    .get('my/shout.collection/find-one', shoutHandle);
  this.assertEq(shout.Message, 'is this thing on');
  this.assertEq(shout.FromPlace, 'rooftops');
*/
}