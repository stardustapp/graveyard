function getScriptRefs(coffee) {
  const refs = new Set;
  const dirRegex = /^( *)%([a-z]+)(?: (.+))?$/img
  coffee.replace(dirRegex, function (_, ws, dir, args) {
    switch (dir.toLowerCase()) {
      case 'inject':
        for (const arg of args.split(',')) {
          // TODO: validate name syntax regex!
          refs.add(arg.trim())
          return `${ws}${arg} = DUST.get ${JSON.stringify(arg)}`;
        }
      default:
        throw new Error(`invalid-directive: '${dir}' is not a valid DustScript directive`);
    }
  });
  return Array.from(refs)
    .map(name => new GraphReference(name));
}

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
        Refs: getScriptRefs(coffee),
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
      const fields = res.fields.map(field => ({
        Key: field.key,
        Type: resolveRecordSchema(field.type),
        IsList: field.isList,
        Optional: field.optional,
        Immutable: field.immutable,
        DefaultValue: field.defaultValue,
      }));

      // add deps for behaviors
      // TODO: belongs here?
      if (res.timestamp) {
        fields.createdAt = {Type: resolveRecordSchema('core:timestamp'), Mutable: false };
        fields.updatedAt = {Type: resolveRecordSchema('core:timestamp'), Mutable: true };
      }
      if (res.slugField) {
        fields.slug = {Type: resolveRecordSchema('core:string'), Mutable: true }
      }

      app.withRecordSchema(res.name, res.version, {
        Base: resolveRecordSchema(res.base),
        Fields: fields,
        TimestampBehavior: res.timestamp,
        SlugBehavior: res.slugField ? {Field: res.slugField} : null,
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
        Handlebars: res.html,
        Style: {
          SCSS: res.scss,
          CSS: res.css,
        },
        Scripts: res.scripts.map(script => {
          const typeMapped = ['LC-Render', 'LC-Create', 'LC-Destroy', 'Helper', 'Event', 'Hook'][script.type];
          const typeObj = {};
          if (typeMapped.startsWith('LC-')) {
            typeObj.Lifecycle = typeMapped.slice(3);
          } else {
            typeObj[typeMapped] = script.param;
          }

          return {
            Type: typeObj,
            Coffee: script.coffee,
            JS: script.js,
            Refs: getScriptRefs(script.coffee),
          };
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
            app.withRoute(encodeURIComponent(route.path), res.version, {
              Path: route.path,
              Action: {
                Type: 'CustomAction',
                Coffee: route.customAction.coffee,
                JS: route.customAction.js,
                Refs: getScriptRefs(route.customAction.coffee),
              },
            });
            break;
          case 'template':
            app.withRoute(encodeURIComponent(route.path), res.version, {
              Path: route.path,
              Action: {
                Render: {
                  Template: app.getTemplate(route.template),
                },
              },
            });
            break;
          default:
            throw new Error('unknown route type '+route.type);
        }
      }
    }

    console.log('Inflated manifest', manifest, 'with builder', builder);
    return builder;
  }

  static deflate(graph) {
    throw new Error('#TODO');
  }
}
