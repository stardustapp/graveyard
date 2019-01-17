
class BaseObject {
  constructor(project, record) {
    this.project = project;
    this.record = record;
  }
}

const OBJECT_TYPES = {
  'external-script': class ExternalScriptObject extends BaseObject {
    constructor(project, record) {
      super(project, record);
    }
  },
  'vue-app': class WebBundleObject extends BaseObject {
    constructor(project, record) {
      super(project, record);
    }

    async renderHtmlResponse() {
      const collectionSrc = Array
        .from(this.project.objects.values())
        .filter(x => x.record.config.type === 'collection')
        .map(x => x.record.config)
        .map(res => {
          const fieldLines = [];
          const behaviors = [];
          for (const fieldKey in res.fields) {
            const field = res.fields[fieldKey];
            let bareType = {
              'core/string': 'String',
              'core/number': 'Number',
              'core/boolean': 'Boolean',
              'core/date': 'Date',
              'core/timestamp': 'Date',
              'core/object': 'Object',
            //TODO: }[field.type] || JSON.stringify(field.type);
            }[field.type] || 'Object';
            if (field.isList) bareType = `[${bareType}]`;
            fieldLines.push(`    ${fieldKey}: {
      type: ${bareType},
      optional: ${!field.required},
      immutable: ${!field.mutable},${field.default && `
      default: function() { return ${JSON.stringify(JSON.parse(field.default))}; },`||''}
    },`);
          }
          return `DUST.resources[${JSON.stringify(res.name)}] = BaseRecord.inherit({
  name: ${JSON.stringify(res.name)},
  fields: {\n${fieldLines.join('\n')}
  },
  behaviors: ${JSON.stringify(behaviors)},
});`;
        }).join('\n');

      return new Response(commonTags.html`<!doctype html>
<title></title>
<link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
<link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>
  __meteor_runtime_config__ = {
    DDP_DEFAULT_CONNECTION_URL: 'http://ddp',
    meteorEnv: {},
  };
</script>
<script src="/~~libs/vendor/libraries/meteor-bundle.js"></script>
<script>
  const ReactiveVar = Package['reactive-var'].ReactiveVar;
  const Tracker = Package.tracker.Tracker;
  const Blaze = Package.ui.Blaze;
  const SpacebarsCompiler = Package['spacebars-compiler'].SpacebarsCompiler;
  const UI = Package.ui.UI;
  const Router = Package['iron:router'].Router;
  const Template = Package['templating-runtime'].Template;
  const Astro = Package['jagi:astronomy'].Astro;
  const Mongo = Package.mongo.Mongo;
  const Session = Package.session.Session;
  const HTML = Package.htmljs.HTML;
  const Spacebars = Package.spacebars.Spacebars;
  const Meteor = Package.meteor.Meteor;

  Template.registerHelper('eq', function(a, b) {
    return a === b;
  });
  Template.registerHelper('renderTemplate', function() {
    try {
      return DUST.get(this.name, 'Template');
    } catch (err) {
      console.log("Failed to render template", this.name, err.message);
      return null;
    }
  });

  DUST = scriptHelpers = {
    _liveTemplates: new Map,
    triggerHook: function(hookName, ...args) {
      var instance, instances, liveSet;
      if (liveSet = DUST._liveTemplates.get(DUST._mainTemplate)) {
        liveSet.dep.depend();
        ({instances} = liveSet);
        if (instances.size === 1) {
          if (instance = instances.values().next().value) {
            return instance.hook(hookName, ...args);
          }
        } else if (instances.size === 0) {
          return console.warn("Hook", hookName, "can't be called - no live template");
        } else {
          return console.warn("Hook", hookName, "can't be called -", instances.size, "live templates");
        }
      }
    },
    resources: {},
    get(name, type) {
      console.log('DUST.get', name, type);
      if (name in DUST.resources) {
        return DUST.resources[name];
      }
      throw new Error('Dust resource '+name+' '+type+' not found');
    },
    params: new ReactiveVar({}),
    navigateTo(path) {
      const APP_ROOT = "/~/apps/by-id/${this.record.projectId}";
      Router.go(APP_ROOT + path);
    },
  };

  // Astronomy minimongo collections
  const Records = new Mongo.Collection('records');
  const BaseRecord = Astro.Class.create({
    name: 'Record',
    collection: Records,
    typeField: 'type',
    fields: {
      objectId  : { type: String, immutable: true },
      packageId : { type: String, immutable: true },
      recordId  : { type: String, immutable: true },
      version   : { type: Number, default: 0 },
    },
    helpers: {
      commit(cb) {
        // TODO: validate locally
        console.log('Saving record version', this.version, 'of', this.type, this._id);
        Meteor.call('/records/commit', this.raw(), (err, res) => {
          if (err) {
            alert(err);
            return typeof cb === "function" ? cb(err) : void 0;
          } else {
            this.version = res.version;
            this._id = res.id;
            return typeof cb === "function" ? cb(null, res) : void 0;
          }
        });
      },
    },
  });
  ${collectionSrc}

  // Data publications
  // (no-op for the moment)
${Array
    .from(this.project.objects.values())
    .filter(x => x.record.config.type === 'record-publication')
    .map(x => x.record.config)
    .map(pub => `  DUST.resources[${JSON.stringify(pub.name)}] = {subscribe: console.log};`)
    .join('\n')}

  // Call a hook on an instance
  Blaze.TemplateInstance.prototype.hook = function(key, ...args) {
    var hooks, ref;
    check(key, String);
    ({hooks} = this.view.template);
    return (ref = hooks[key]) != null ? ref.apply(this, args) : void 0;
  };
  // Register hooks on a template
  Blaze.Template.prototype.registerHook = function(key, hook) {
    if (key in this.hooks) {
      throw new Meteor.Error('hook-exists', "Template hook already exists");
    }
    return this.hooks[key] = hook;
  };

  // patch in our extra spacebars tags
  const indexOf = [].indexOf;
  const RenderSmartTag = function(view, name) {
    var injector, template;
    if (indexOf.call(name, ':') < 0) {
      return HTML.getTag(name);
    }
    // remove arbitrary pkglocal prefix from spacebars
    if (name.slice(0, 3) === 'my:') {
      name = name.slice(3);
    } else {
      name = name.split(':').map(function(str) {
        return str.slice(0, 1).toUpperCase() + str.slice(1).replace(/-([a-z])/g, function(d) {
          return d[1].toUpperCase();
        });
      }).join(':');
    }
    injector = view.template.injector;
    template = injector.get(name, 'Template');
    return function(...args) {
      var attrs, contents, parentData, ref, ref1;
      attrs = null;
      contents = null;
      if ((ref = (ref1 = args[0]) != null ? ref1.constructor : void 0) === HTML.Attrs || ref === Object) {
        [attrs, ...contents] = args;
      } else {
        contents = args;
      }
      //if attrs?.constructor is HTML.Attrs
      // TODO: flatten the attrs
      console.log('Providing tag', name, 'with', attrs); //, contents
      parentData = Template.currentData();
      if (attrs) {
        return Blaze.With(function() {
          var data, key, val, val2;
          data = {};
          RenderSmartTag.inSmartTag = true;
          for (key in attrs) {
            val = attrs[key];
            if (val.constructor === Function) {
              val2 = val();
              if ((val2 != null ? val2.constructor : void 0) === Array) {
                // TODO: when is this an array?
                val2 = val2[0];
              }
              if ((val2 != null ? val2.constructor : void 0) === Function) {
                // this is not a function when the value is a helper tag
                val2 = val2();
              }
              data[key] = val2;
            } else {
              data[key] = val;
            }
          }
          RenderSmartTag.inSmartTag = false;
          return data;
        }, function() {
          return Spacebars.include(template, function() {
            return Blaze.With((function() {
              return parentData;
            }), (function() {
              return contents;
            }));
          });
        });
      } else {
        return Spacebars.include(template, function() {
          return contents;
        });
      }
    };
  };
  const realMustache = Spacebars.mustache.bind(Spacebars);
  RenderSmartTag.inSmartTag = false;
  Spacebars.mustache = function(...thing) {
    if (RenderSmartTag.inSmartTag) {
      return thing;
    } else {
      return realMustache(...thing);
    }
  };
  HTML.getSmartTag = RenderSmartTag.bind(this);

  // Blaze templates
  const templates = ${JSON.stringify(Array
    .from(this.project.objects.values())
    .filter(x => x.record.config.type === 'blaze-component')
    .map(x => x.record.config))};
  for (const template of templates) {
    const {name} = template;
    const parts = [template.template];
    if (template.style.css) {
      parts.push(\`<style type='text/css'>\${template.style.css}</style>\`);
    }
    const source = parts.join('\\n\\n');
    const compiled = SpacebarsCompiler
      .compile(source, {isTemplate: true})
      .replace(/HTML\\.getTag\\("/g, 'HTML.getSmartTag(view, "');
    const renderer = eval(compiled);
    UI.Template.__define__(name, renderer);

    // register template for outside hooking
    if (!DUST._liveTemplates.has(name)) {
      DUST._liveTemplates.set(name, {
        dep: new Tracker.Dependency(),
        instances: new Set()
      });
    }
    const liveSet = DUST._liveTemplates.get(name);

    // init hook system
    Template[name].hooks = {};
    Template[name].onCreated(function() {
      liveSet.instances.add(this);
      return liveSet.dep.changed();
    });
    Template[name].onDestroyed(function() {
      liveSet.instances.delete(this);
      return liveSet.dep.changed();
    });
    //Template[name].injector = this;

    template.scripts.forEach(function({key, type, param, js}) {
      var err, func, inner, raw;
      try {
        raw = eval(js);
        if (!js.endsWith('.call();\\n')) {
          raw = raw.apply(window.scriptHelpers);
        }
        inner = raw.apply(); // .apply(window.scriptHelpers) # TODO: used?
      } catch (error) {
        err = error;
        console.log("Couldn't compile", key, "for", name, '-', err);
        return;
      }
      func = function() {
        var _, charNum, line, lineNum, ref, ref1, ref2, stack;
        try {
          return inner.apply(this, arguments);
        } catch (error) {
          err = error;
          stack = (ref = err.stack) != null ? ref.split('Object.eval')[0] : void 0;
          [_, lineNum, charNum] = (ref1 = (ref2 = err.stack) != null ? ref2.match(/<anonymous>:(\d+):(\d+)/) : void 0) != null ? ref1 : [];
          if (lineNum != null) {
            stack += \`\${key} (\${lineNum}:\${charNum} for view \${name})\`;
            console.log(err.message, stack);
            line = js.split('\\n')[lineNum - 1];
            return console.log('Responsible line:', line);
          } else {
            return console.log(err);
          }
        }
      };
      // TODO: report error
      switch (type) {
        case 'helper':
          return Template[name].helpers({
            [\`\${param}\`]: func
          });
        case 'event':
          return Template[name].events({
            [\`\${param}\`]: func
          });
        case 'hook':
          return Template[name].registerHook(param, func);
        case 'on-create':
          return Template[name].onCreated(func);
        case 'on-render':
          return Template[name].onRendered(func);
        case 'on-destroy':
          return Template[name].onDestroyed(func);
      }
    });

    Template[name].baseName = name;
    Template[name].dynName = name;
    DUST.resources[name] = Template[name];
  }

  // Iron routers
  function runRoute(route) {
    console.log('running route', route, this);
    const defaultLayout = ${JSON.stringify(this.record.config.defaultLegacyLayoutId||null)};
    if (defaultLayout) {
      this.layout(defaultLayout);
    }
    DUST.params.set(this.params);
    const ctx = {
      params: this.params,
      render: (templateName, opts={}) => {
        const template = DUST.get(templateName || route.name, 'Template');
        opts.data = opts.data || {params: this.params};
        DUST._mainTemplate = templateName;
        this.render(template.dynName, opts);
      },
    };
    switch (route.type) {
      case 'blaze-template':
        ctx.render(route.action, route.params); // TODO: fix action to be an object
        break;
      case 'inline-script':
        // Compile the route action
        try {
          inner = eval(route.action.js).apply(window.scriptHelpers);
        } catch (err) {
          console.log("Couldn't compile custom code for route", route, '-', err);
          return;
          // TODO: 500
        }
        inner.apply(ctx);
        break;
      default:
        throw new Error('weird route '+JSON.stringify(route));
    }
  }
  ${this.record.config.routes.map(route =>
  `Router.route(${JSON.stringify('/~/apps/by-id/:appId'+route.path)}, function() {
  runRoute.call(this, ${JSON.stringify(route)});
});`).join('\n')}
</script>
      `, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    }
  },
  'collection': class CollectionObject extends BaseObject {
    constructor(project, record) {
      super(project, record);
    }
    async insert(data) {
      //console.log('inserting', data, this.record);
      const {projectId, objectId} = this.record;
      const recordId = randomString(3);
      const tx = this.project.db.idb.transaction(['records'], 'readwrite');
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
      const tx = this.project.db.idb.transaction(['records'], 'readwrite');
      const data = await tx.objectStore('records').getAll(IDBKeyRange.bound(
        [projectId, objectId, '#'],
        [projectId, objectId, '~']));
      return data;
    }
  },

  'record-publication': class DocumentPublicationObject extends BaseObject {
    constructor(project, record) {
      super(project, record);
      console.log('created record-publication', record);
    }
  },

  'blaze-component': class BlazeComponentObject extends BaseObject {
    constructor(project, record) {
      super(project, record);
      console.log('created blaze-component', record);
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

  const project = await db.createProject({
    forceId: manifest.packageId,
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
            type: 'vue-app',
            version: resource.version,
            //input: {type: 'http/path'},
            defaultLegacyLayoutId: resource.layout,
            //output: {type: 'web/virtual-dom'},
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
          console.log(resource);
          return {
            name: resource.name,
            //type: (resource.base === 'core:Record') ? 'collection' : resource.base, // TODO
            type: 'collection',
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