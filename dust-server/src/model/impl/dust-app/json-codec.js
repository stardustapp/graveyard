function getScriptRefs(coffee) {
  const refs = new Set;
  const dirRegex = /^( *)%([a-z]+)(?: (.+))?$/img;
  coffee.replace(dirRegex, function (_, ws, dir, args) {
    switch (dir.toLowerCase()) {
      case 'inject':
        return args.split(',').map(arg => {
          // TODO: validate name syntax regex!
          refs.add(arg.trim())
          return `${ws}${arg} = DUST.get ${JSON.stringify(arg)}`;
        }).join('\n');
      default:
        throw new Error(`invalid-directive: '${dir}' is not a valid DustScript directive`);
    }
  });
  return Array.from(refs)
    .map(name => new GraphReference(name));
}

GraphEngine.extend('dust-app/v1-beta1').pocCodec = {

  inflate(manifest, dependencies) {
    if (manifest._platform !== 'stardust') throw new Error(
      'invalid stardust manifest');
    if (manifest._version !== 3) throw new Error(
      'invalid stardust manifest');

    const engine = GraphEngine.get('dust-app/v1-beta1');
    const builder = new GraphBuilder(engine);
    self.builder = builder;

    // root node from manifest meta
    const app = builder.withPackage(manifest.meta.name, 1, {
      PackageKey: manifest.packageId,
      PackageType: manifest.meta.type,
      License: manifest.meta.license,
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
      //console.log(coffee.length, 'inflating script', coffee);
      return {
        Coffee: coffee,
        JS: js,
        Refs: getScriptRefs(coffee),
      }
    }

    function resolveRecordSchema(name) {
      if (name.startsWith('core:')) {
        return { BuiltIn: name[5].toUpperCase() + name.slice(6) };
      } else if (name.includes(':')) {
        throw new Error(`recordSchema ${JSON.stringify(name)} scoping not implemented`);
      } else {
        return { SchemaRef: app.getRecordSchema(name) };
      }
    }


    for (const res of resources.Dependency) {
      let otherPkg;
      if (res.childPackage === manifest.packageId) {
        // self-reference
        otherPkg = app;
      } else {
        otherPkg = dependencies[res.childPackage];
        if (!otherPkg) throw new Error(
          `Package ${manifest.packageId} Dependency couldn't find package ${JSON.stringify(res.childPackage)}`);
      }

      app.withDependency(res.name, res.version, {
        PackageKey: res.childPackage,
        ChildRoot: new GraphReference(otherPkg),
      });
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
      app.withServerMethod(res.name, res.version, inflateScript(res.coffee, res.js));
    }


    function mapDocLocator (child) {
      return {
        Children: child.children.map(mapDocLocator),
        FilterBy: child.filterBy,
        Fields: (child.fields||'').length > 2 ? child.fields : null,
        SortBy: (child.sortBy||'').length > 2 ? child.sortBy : null,
        LimitTo: child.limitTo || null,
        RecordType: resolveRecordSchema(child.recordType),
      };
    }
    for (const res of resources.Publication) {
      app.withPublication(res.name, res.version, mapDocLocator(res));
    }


    for (const res of resources.Template) {
      app.withTemplate(res.name, res.version, {
        Handlebars: res.html,
        Style: {
          SCSS: res.scss,
          CSS: res.css || '',
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

      const router = app.withAppRouter('Router', res.version, {
        IconUrl: manifest.meta.iconUrl,
      });

      if (res.layout) {
        const layout = app.getTemplate(res.layout);
        router.setDefaultLayout(layout);
      }

      for (const route of res.entries) {
        switch (route.type) {
          case 'customAction':
            router.withRoute(route.path, 1, {
              Path: route.path,
              Action: {
                Script: {
                  Coffee: route.customAction.coffee,
                  JS: route.customAction.js,
                  Refs: getScriptRefs(route.customAction.coffee),
                },
              },
            });
            break;
          case 'template':
            router.withRoute(route.path, 1, {
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

    //console.log('Inflated manifest', manifest, 'with builder', builder);
    return builder;
  },

  deflate(graph) {
    throw new Error('#TODO');
  },
};
