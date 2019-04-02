new GraphEngineBuilder('dust-app/v1-beta1', build => {

  build.node('Package', {
    relations: [
      { predicate: 'TOP' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'AppRouter' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'Template' },
      //{ predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'Collection' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'RecordSchema' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'Dependency' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'Publication' },
      { predicate: 'HAS_NAME', uniqueBy: 'Name', object: 'ServerMethod' },
    ],
    fields: {
      PackageKey: String,
      PackageType: { type: String, choices: [ 'Package', 'Library', 'App' ] },
      License: String,
    },
  });

  // These fields are for DUST bookkeeping
  // Every 'resource' from PoC has them
  const ResourceFields = {
    Name: String,
    Version: Number,
  };

  // These fields store arbitrary executable code
  // Should probably be refactored into its own node
  const ScriptFields = {
    Source: { anyOfKeyed: {
      Coffee: String,
      // TODO: add other languages
    }},
    JS: String,
    Refs: { reference: true, isList: true },
  }

  build.node('AppRouter', {
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
      IconUrl: { type: String, optional: true },
      DefaultLayout: { reference: 'Template', optional: true },
      RouteTable: { reference: 'Route', isList: true },
    },
  });

  build.node('Route', {
    relations: [
      { exactly: 1, subject: 'AppRouter', predicate: 'REFERENCES' },
    ],
    fields: {
      Path: String,
      Action: {
        anyOfKeyed: {
          Script: { fields: {
            ...ScriptFields,
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
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
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
        ...ScriptFields,
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
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
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
    behavior: class DustAppRecordSchema extends GraphObject {
      // walk schema back to BuiltIns, in reverse order
      getSchemaStack() {
        const stack = [this];
        let cursor = this;
        while (cursor.Base.SchemaRef) {
          cursor = self.gs.objects.get(cursor.Base.SchemaRef);
          stack.unshift(cursor);
        }
        return stack;
      }
      // list off all direct child schemas
      getChildSchemas() {
        return self.gs
          .graphs.get(this.data.graphId)
          .selectAllWithType('RecordSchema')
          .filter(x => x.Base.SchemaRef == this.data.objectId);
      }
      // list self and any children types, recursively
      getPossibleTypes() {
        const seenTypes = new Set;
        function process(obj) {
          seenTypes.add(obj);
          for (const child of obj.getChildSchemas()) {
            if (seenTypes.has(child)) continue;
            // we know Base.key is SchemaRef
            process(child);
          }
        }
        process(this);
        return Array.from(seenTypes);
      }
    },
  });

  build.node('Dependency', {
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
      // TODO: support npm, apt, docker deps
      PackageKey: { type: String },
      ChildRoot: { reference: 'Package' },
    },
  });

  const DocLocatorFields = {
    RecordType: { anyOfKeyed: {
      BuiltIn: { type: String, choices: [ 'Record', 'Class' ]},
      SchemaRef: { reference: 'RecordSchema' },
    }},
    // TODO: these three 'String' fields should be 'JSON'
    FilterBy: { type: String, optional: false },
    SortBy: { type: String, optional: true },
    Fields: { type: String, optional: true },
    LimitTo: { type: Number, optional: true },
    //Children: { embed: '@' }, // self recursion
  };
  // recursive field just to make things difficult
  DocLocatorFields.Children = { fields: DocLocatorFields, isList: true };

  build.node('Publication', {
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
      ...DocLocatorFields,
    },
    behavior: class DustAppPublication extends GraphObject {
      getRecordFilter(rootPublication=this) {
        // empty specs mean every type
        const sourceSpec = {};

        // but some subs are specific so
        if (this.RecordType.SchemaRef) {
          const schemaObj = self.gs.objects.get(this.RecordType.SchemaRef);
          sourceSpec.types = schemaObj
            .getPossibleTypes()
            .map(x => x.data.name);
        }

        // build the filter
        const filterBy = JSON.parse(this.FilterBy);
        const filter = new RecordFilter({
          sourceSpec,
          filterFunc: this.FilterBy.length > 2
            ? (doc, refs) => {
              for (const key of Object.keys(filterBy)) {
                const val = filterBy[key];
                if (val && '$param' in val) {
                  //console.log('param diff', key, '-', doc[key], refs.param[val.$param]);
                  return doc[key] === refs.param[val.$param];
                } else if (val && '$parent' in val) {
                  console.warn(key, val, doc);
                  if (val.$field && val.$field.includes('[].')) throw new Error(
                    `TODO: $parent's $field in FilterBy is complex`);
                    //filterBy[key] = if val.$field?.includes '[].'
                    //  [ary, key2] = val.$field.split '[].'
                    //  $in: parents[val.$parent][ary]?.map((x) -> x[key2]) ? []
                  const refVal = refs.parent[val.$parent][val.$field || '_id'];
                  return doc[key] === refVal;
                } else {
                  console.log('fixed diff', key, '-', doc[key], val);
                  return doc[key] === val;
                }
              }
              console.log('filterFunc()', this, doc, refs);
              throw new Error('TODO: FilterBy');
            } : null,
          sort: this.SortBy && JSON.parse(this.SortBy),
          fields: this.Fields && JSON.parse(this.Fields),
          limit: this.LimitTo,
        });

        for (const childSpec of this.Children) {
          filter.addChild(rootPublication
            .getRecordFilter.call(childSpec, rootPublication));
        }

        return filter.build();
      }
    },
  });

  build.node('ServerMethod', {
    relations: [
      { exactly: 1, subject: 'Package', predicate: 'HAS_NAME' },
    ],
    fields: {
      ...ResourceFields,
      ...ScriptFields,
    },
  });

}).install();
