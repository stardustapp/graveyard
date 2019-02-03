// Largely sourced and compiled from https://github.com/danopia/stardust/tree/master/poc/lib/_schema

const DB = {};

DB.Packages = new Mongo.Collection('build-packages');

DB.Package = Astro.Class.create({
  name: 'Package',
  collection: DB.Packages,
  typeField: 'type',
  secured: false,
  fields: {
    name: {
      type: String
    },
    license: {
      type: String
    },
    libraries: {
      type: [String]
    }
  }
});

DB.App = DB.Package.inherit({
  name: 'App',
  fields: {
    iconUrl: {
      type: String,
      optional: true
    },
    layoutId: {
      type: String,
      optional: true
    }
  }
});

DB.Library = DB.Package.inherit({
  name: 'Library'
});

//#################
//# Resources
// Injectable code and config that defines app behavior
// Has similar roles to Angular recipes
DB.Resources = new Mongo.Collection('resources');

DB.Resource = Astro.Class.create({
  name: 'Resource',
  collection: DB.Resources,
  typeField: 'type',
  fields: {
    packageId: {
      type: String,
      immutable: true
    },
    name: {
      type: String
    },
    version: {
      type: Number
    }
  }
});

// injects   : type: [String]

//###############
//# Route tables
DB.RouteTableCustomAction = Astro.Class.create({
  name: 'RouteTableCustomAction',
  fields: {
    coffee: {
      type: String
    },
    js: {
      type: String
    }
  }
});

// TODO: must have at least one action
DB.RouteTableEntry = Astro.Class.create({
  name: 'RouteTableEntry',
  fields: {
    path: {
      type: String
    },
    type: {
      type: String
    },
    // template, customAction
    template: {
      type: String,
      optional: true
    },
    // layout       : type: String, optional: true
    customAction: {
      type: DB.RouteTableCustomAction,
      optional: true
    }
  }
});

DB.RouteTable = DB.Resource.inherit({
  name: 'RouteTable',
  fields: {
    layout: {
      type: String,
      optional: true
    },
    entries: {
      type: [DB.RouteTableEntry],
      default: function() {
        return [];
      }
    }
  }
});

//###############
//# UI Templates
DB.TemplateScriptType = Astro.Enum.create({
  name: 'TemplateScriptType',
  identifiers: ['on-render', 'on-create', 'on-destroy', 'helper', 'event', 'hook']
});

DB.TemplateScript = Astro.Class.create({
  name: 'TemplateScript',
  fields: {
    key: {
      type: String
    },
    type: {
      type: DB.TemplateScriptType
    },
    param: {
      type: String,
      optional: true
    },
    coffee: {
      type: String
    },
    js: {
      type: String
    }
  }
});

DB.Template = DB.Resource.inherit({
  name: 'Template',
  fields: {
    html: {
      type: String,
      default: '<div>\n  Hello World\n</div>'
    },
    css: {
      type: String,
      optional: true
    },
    scss: {
      type: String,
      optional: true
    },
    scripts: {
      type: [DB.TemplateScript],
      default: function() {
        return [];
      }
    }
  }
});

//#########################
//# Custom Record Classes
DB.TemplateScriptType = Astro.Enum.create({
  name: 'TemplateScriptType',
  identifiers: ['on-render', 'on-create', 'on-destroy', 'helper', 'event', 'hook']
});

// TODO: check that Type resolves
DB.RecordField = Astro.Class.create({
  name: 'RecordField',
  fields: {
    key: {
      type: String
    },
    type: {
      type: String
    },
    // core:string/number/boolean/date/object or custom
    isList: {
      type: Boolean,
      default: false
    },
    optional: {
      type: Boolean,
      default: false
    },
    immutable: {
      type: Boolean,
      default: false
    },
    default: {
      type: String,
      optional: true // as [E]JSON string
    }
  }
});

// TODO: enum, transient, mapping

// TODO: don't let these rename
// TODO: check that Base resolves
DB.CustomRecord = DB.Resource.inherit({
  name: 'CustomRecord',
  fields: {
    base: {
      type: String,
      default: 'core:Record'
    },
    dataScope: {
      type: String,
      default: 'global' // or group or user
    },
    fields: {
      type: [DB.RecordField],
      default: function() {
        return [];
      }
    },
    // Behaviors
    // TODO: need to be dynamic, w/ helpers
    timestamp: {
      type: Boolean,
      default: false
    },
    slugField: {
      type: String,
      optional: true
    }
  }
});

//###############
//# Data publications
DB.DocLocator = Astro.Class.create({
  name: 'DocLocator',
  fields: {
    recordType: {
      type: String,
      default: 'core:Record'
    },
    filterBy: {
      type: String,
      optional: true
    },
    sortBy: {
      type: String,
      optional: true
    },
    fields: {
      type: String,
      optional: true
    },
    limitTo: {
      type: Number,
      optional: true
    }
  }
});

DB.DocLocator.extend({
  fields: {
    children: {
      type: [DB.DocLocator],
      default: function() {
        return [];
      }
    }
  }
});

DB.Publication = DB.Resource.inherit({
  name: 'Publication',
  fields: {
    // TODO: security, auth check
    recordType: {
      type: String,
      default: 'core:Record'
    },
    filterBy: {
      type: String,
      optional: true
    },
    sortBy: {
      type: String,
      optional: true
    },
    fields: {
      type: String,
      optional: true
    },
    limitTo: {
      type: Number,
      optional: true
    },
    children: {
      type: [DB.DocLocator],
      default: function() {
        return [];
      }
    }
  }
});

//###############
//# Server methods
DB.ServerMethod = DB.Resource.inherit({
  name: 'ServerMethod',
  fields: {
    // TODO: auth/security setting
    coffee: {
      type: String,
      optional: true
    },
    js: {
      type: String,
      optional: true
    },
    injects: {
      type: [String],
      default: function() {
        return [];
      }
    }
  }
});

//###############
//# Dependencies
DB.Dependency = DB.Resource.inherit({
  name: 'Dependency',
  fields: {
    childPackage: {
      type: String,
      optional: true
    },
    isOptional: {
      type: Boolean,
      default: false
    },
    isExtended: {
      type: Boolean,
      default: false
    }
  }
});

/*
//# Data records
// Actual data stored by the application
DB.Records = new Mongo.Collection('records');

DB.Record = Astro.Class.create({
  name: 'Record',
  collection: DB.Records,
  typeField: 'type',
  fields: {
    packageId: {
      type: String,
      immutable: true
    },
    //table     : type: String, optional: true
    version: {
      type: Number,
      default: 0
    },
    scope: {
      type: String,
      immutable: true
    }
  }
});

// global, group:asdf, user:qwert
//hashKey   : type: String, optional: true
//sortKey   : type: String, optional: true
// TODO: this should really be a number, date, string, etc
//data      : type: Object, optional: true
*/