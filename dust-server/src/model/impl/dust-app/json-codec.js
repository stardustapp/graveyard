class DustAppJsonCodec {
  static inflate(manifest) {
    if (manifest._platform !== 'stardust') throw new Error(
      'invalid stardust manifest');
    if (manifest._version !== 3) throw new Error(
      'invalid stardust manifest');

    const engine = GraphEngine.get('dust-app/v1-beta1');
    const builder = new GraphBuilder(engine);
    self.builder = builder;

    // root node from manifest meta
    const app = builder.withApplication(manifest.meta.name, 1, {
      PackageId: manifest.packageId,
      License: manifest.meta.license,
      IconUrl: manifest.meta.iconUrl,
    });

    // sort manifest resources for specialized logic
    const resources = {
      CustomRecord: [],
      Dependency: [],
      Publication: [],
      RouteTable: [],
      ServerMethod: [],
      Template: [],
    };
    for (const res of manifest.resources) {
      resources[res.type].push(res);
    }

    function inflateScript(coffee, js) {
      console.log(coffee.length, 'inflating script', coffee);
      return {
        Coffee: coffee,
        JS: js,
      }
    }

    function resolveRecordSchema(name) {
      if (name.startsWith('core:')) {
        return { BuiltIns: name.slice(5) };
      } else if (name.includes(':')) {
        throw new Error(`recordSchema ${JSON.stringify(name)} scoping not implemented`);
      } else {
        return { SchemaRef: app.getRecordSchema(name) };
      }
    }


    for (const res of resources.CustomRecord) {
      // translate the fields
      const fields = {};
      for (const field of res.fields) {
        fields[field.key] = {
          Type: field.type.replace(':', '/'), // TODO
          IsList: !!field.isList,
          Required: !field.optional,
          Mutable: !field.immutable,
          DefaultValue: field.defaultValue,
        };
      }

      // add behaviors
      if (res.timestamp) {
        fields.createdAt = {Type: 'core/timestamp', InsertionDefault: 'now', Mutable: false };
        fields.updatedAt = {Type: 'core/timestamp', UpdateDefaultq: 'now', Mutable: true };
      }
      if (res.slugField) {
        fields.slug = {Type: 'core/string', InsertionDefault: `slugOf($.${res.slugField})`, Mutable: false }
      }

      app.withRecordSchema(res.name, res.version, {
        Base: resolveRecordSchema(res.base),
        Fields: fields,
      });
    }


    for (const res of resources.ServerMethod) {
      app.withServerMethod(res.name, res.version, inflateScript(res));
    }


    for (const res of resources.Publication) {
      app.withPublication(res.name, res.version, {
        Children: res.children,
        Fields: res.fields,
        FilterBy: res.filterBy,
        LimitTo: res.limitTo,
        RecordType: resolveRecordSchema(res.recordType),
        SortBy: res.sortBy,
      });
    }


    for (const res of resources.Template) {
      app.withTemplate(res.name, res.version, {
        Template: res.html,
        Style: {
          SCSS: res.scss,
          CSS: res.css,
        },
        Scripts: res.scripts.map(script => {
          console.log('script', script);
          script.Type = ['on-render', 'on-create', 'on-destroy', 'helper', 'event', 'hook'][script.type];
          return script;
        }),
      });
    }


    for (const res of resources.RouteTable) {
      if (res.name !== 'RootRoutes') continue;

      if (res.layout) {
        const layout = app.getTemplate(res.layout);
        app.setDefaultLayout(layout);
      }

      for (const route of res.entries) {
        switch (route.type) {
          case 'customAction':
            route = app.withRoute(encodeURIComponent(entry.path), {
              Path: entry.path,
              Action: {
                Type: 'CustomAction',
                Coffee: entry.customAction.coffee,
                JS: entry.customAction.js,
              },
            });
            break;
          case 'template':
            route = app.withRoute(encodeURIComponent(entry.path), {
              Path: entry.path,
              Action: {
                RenderTemplate: app.getTemplate(entry.template),
              },
            });
            break;
          default:
            throw new Error('unknown route type '+entry.type);
        }
      }
    }


    console.log('Inflated manifest', manifest, 'with builder', builder);
  }

  static deflate(graph) {
    throw new Error('#TODO');
  }
}
