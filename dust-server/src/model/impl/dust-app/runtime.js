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
const moment = Package['momentjs:moment'].moment;
const check = Package.check.check;

const scriptHelpers = {
  _liveTemplates: new Map,
  triggerHook: function(hookName, ...args) {
    var instance, instances, liveSet;
    if (liveSet = scriptHelpers._liveTemplates.get(scriptHelpers._mainTemplate)) {
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
  objects: {},
  get(name, type) {
    if (!name || name.constructor !== String) {
      console.warn('Reference:', name);
      throw new Error(
        `DUST reference was ${name.constructor.name} instead of String`);
    }
    if (!name.includes(':'))
      name = `my:${encodeURIComponent(name)}`;

    // resolve the scope
    const [pkg, path] = name.split(':');
    const pkgTree = this.resTree[pkg];
    if (!pkgTree) throw new Error(
      `DUST reference ${JSON.stringify(name)} didn't resolve to a package`);
    const node = pkgTree[path];
    if (!node) throw new Error(
      `DUST reference ${JSON.stringify(name)} didn't resolve to an object`);

    // support built-ins and objects that are already loaded
    if (node.constructor === String) {
      if (node in this.objects)
        return this.objects[node];
    } else if ('objectId' in node) {
      if (node.objectId in this.objects)
        return this.objects[node.objectId];
    } else {
      return node;
    }

    throw new Error(
      `DUST resource ${JSON.stringify(name)} (${type||'any'}) not found`);
  },

  params: new ReactiveVar({}),
  navigateTo(path) {
    Router.go(APP_ROOT + path);
  },
};

Template.registerHelper('eq', function(a, b) {
  return a === b;
});
Template.registerHelper('renderTemplate', function() {
  try {
    return scriptHelpers.get(this.name, 'Template');
  } catch (err) {
    console.log("Failed to render template", this.name, err.message);
    return null;
  }
});

// Astronomy minimongo collections
const Records = new Mongo.Collection('records');
const BaseClass = Astro.Class.create({
  name: 'core:Class',
});
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

function InflateBlazeTemplate(template) {
  const {name} = template;
  const parts = [template.template];
  if (template.css) {
    parts.push(`<style type="text/css">${template.css}</style>`);
  }
  const source = parts.join('\n\n');
  const compiled = SpacebarsCompiler
    .compile(source, {isTemplate: true})
    .replace(/HTML\.getTag\("/g, 'HTML.getSmartTag(view, "');
  const renderer = eval(compiled);
  UI.Template.__define__(name, renderer);

  // register template for outside hooking
  if (!scriptHelpers._liveTemplates.has(name)) {
    scriptHelpers._liveTemplates.set(name, {
      dep: new Tracker.Dependency(),
      instances: new Set()
    });
  }
  const liveSet = scriptHelpers._liveTemplates.get(name);

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
  Template[name].injector = scriptHelpers;

  Template[name].addScript = function(type, param, factory) {
    var err, func;
    try {
      func = factory.apply();
    } catch (error) {
      err = error;
      console.log("Couldn't compile", type, param, "for", name, '-', err);
    return this;
    }
    // TODO: report error
    switch (type) {
      case 'Helper':
        Template[name].helpers({
          [`${param}`]: func
        });
        break;
      case 'Event':
        Template[name].events({
          [`${param}`]: func
        });
        break;
      case 'Hook':
        Template[name].registerHook(param, func);
        break;
      case 'Lifecycle':
        switch (param) {
          case 'Create':
            Template[name].onCreated(func);
            break;
          case 'Render':
            Template[name].onRendered(func);
            break;
          case 'Destroy':
            Template[name].onDestroyed(func);
            break;
        }
        break;
    }
    return this;
  };

  Template[name].baseName = name;
  Template[name].dynName = name;
  return Template[name];
}

class DustPublication {
  constructor(context, res) {
    this.context = context;
    this.res = res;
    this.injector = scriptHelpers;

    const {BuiltIn, SchemaRef} = res.RecordType;
    if (BuiltIn) {
      this.recordType = this.injector.get(`core:${BuiltIn}`, 'CustomRecord');
    } else if (SchemaRef) {
      this.recordType = this.injector.objects[SchemaRef];
    }
  }

  find(params = {}, parents = []) {
    var ary, filterBy, key, key2, opts, ref, ref1, ref2, ref3, ref4, ref5, val;
    opts = {};
    if (((ref = this.res.sortBy) != null ? ref.length : void 0) > 2) {
      opts.sort = JSON.parse(this.res.sortBy);
    }
    if (((ref1 = this.res.fields) != null ? ref1.length : void 0) > 2) {
      opts.fields = JSON.parse(this.res.fields);
    }
    if (this.res.limitTo) {
      opts.limit = this.res.limitTo;
    }
    filterBy = JSON.parse(this.res.filterBy);
// TODO: recursive
    for (key in filterBy) {
      val = filterBy[key];
      if ((val != null ? val.$param : void 0) != null) {
        filterBy[key] = params[val.$param];
      } else if ((val != null ? val.$parent : void 0) != null) {
        filterBy[key] = ((ref2 = val.$field) != null ? ref2.includes('[].') : void 0) ? ([ary, key2] = val.$field.split('[].'), {
          $in: (ref3 = (ref4 = parents[val.$parent][ary]) != null ? ref4.map(function(x) {
            return x[key2];
          }) : void 0) != null ? ref3 : []
        }) : parents[val.$parent][(ref5 = val.$field) != null ? ref5 : '_id'];
      }
    }
    console.log('filtering by', filterBy);
    return this.recordType.find(filterBy, opts);
  }

  subscribe(params={}) {
    const args = ['/dust/publication', this.context, this.res.name, params];

    const inst = Template.instance();
    if (inst) {
      return inst.subscribe(...args);
    } else {
      console.warn('Using application-wide subscribe for', this.res.name);
      return Meteor.subscribe(...args);
    }
  }

  children() {
    return this.res.children.map((c) => {
      return new DustPublication(this.context, c);
    });
  }
}

// curried function
// args includes the callback for sure
function DustMethod(context, name) {
  return function (...args) {
    Meteor.call('/dust/method', context, name, ...args);
  }
}

class DustRouter {
  constructor(opts) {
    this.baseUrl = opts.baseUrl;
    this.defaultLayout = opts.defaultLayout;
  }

  add(path, callback) {
    const self = this;
    Router.route(this.baseUrl+path, function () {
      if (self.defaultLayout) {
        this.layout(self.defaultLayout);
      }

      const ctx = {
        params: this.params,
        render: (template, opts={}) => {
          // support passing a template directly
          if (template.constructor !== Template)
            template = scriptHelpers.get(template, 'Template');

          opts.data = opts.data || {params: this.params};
          scriptHelpers._mainTemplate = template.dynName;
          this.render(template.dynName, opts);
        },
      };

      scriptHelpers.params.set(this.params);
      callback.call(ctx);
    });
  }
}
