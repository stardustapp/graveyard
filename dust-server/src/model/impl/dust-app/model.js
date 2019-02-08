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
    // TODO: these three 'String' fields should be 'JSON'
    FilterBy: { type: String, optional: false },
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
        const filter = new RecordFilter({
          sourceSpec,
          filterFunc: this.FilterBy.length > 2
            ? (doc, refs) => {
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
    treeRole: 'leaf',
    fields: {
      Coffee: String,
      JS: String,
      Refs: { reference: true, isList: true },
    },
  });

}).install();