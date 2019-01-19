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
    if (name in DUST.resources) {
      return DUST.resources[name];
    }
    throw new Error('Dust resource '+name+' '+type+' not found');
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
    return DUST.get(this.name, 'Template');
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
  Template[name].injector = DUST;

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
      case 'helper':
        Template[name].helpers({
          [`${param}`]: func
        });
        break;
      case 'event':
        Template[name].events({
          [`${param}`]: func
        });
        break;
      case 'hook':
        Template[name].registerHook(param, func);
        break;
      case 'on-create':
        Template[name].onCreated(func);
        break;
      case 'on-render':
        Template[name].onRendered(func);
        break;
      case 'on-destroy':
        Template[name].onDestroyed(func);
        break;
    }
    return this;
  };

  Template[name].baseName = name;
  Template[name].dynName = name;
  return Template[name];
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
        render: (templateName, opts={}) => {
          const template = DUST.get(templateName, 'Template');
          opts.data = opts.data || {params: this.params};
          DUST._mainTemplate = templateName;
          this.render(template.dynName, opts);
        },
      };

      DUST.params.set(this.params);
      callback.call(ctx);
    });
  }
}
