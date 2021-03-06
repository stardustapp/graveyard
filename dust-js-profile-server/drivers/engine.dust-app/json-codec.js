GraphEngine.extend('dust-app/v1-beta1').pocCodec = {

  async inflateFromManifest(graphCtx, {manifest, dependencies}) {
    if (manifest._platform !== 'stardust') throw new Error(
      'invalid stardust manifest');
    if (manifest._version !== 3) throw new Error(
      'invalid stardust manifest');

    const package = await graphCtx.newTopNode({
      DisplayName: manifest.meta.name,
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

    function inflateScript(Coffee, js) {
      //console.log(coffee.length, 'inflating script', coffee);
      return {
        Source: { Coffee },
        JS: js,
        Refs: [],
      };
    }

    for (const res of resources.Dependency) {
      let otherPkg;
      if (res.childPackage === manifest.packageId) {
        // self-reference
        otherPkg = package;
      } else {
        otherPkg = dependencies[res.childPackage];
        console.log('depping otherPkg', otherPkg);
        if (!otherPkg) throw new Error(
          `Package ${manifest.packageId} Dependency couldn't find package ${JSON.stringify(res.childPackage)}`);
      }

      await package.HAS_NAME.newDependency({
        Name: res.name,
        Version: res.version,
        PackageKey: res.childPackage,
        ChildRoot: otherPkg,
      });
    }

    async function createRecordSchema(res) {
      // translate the fields
      const fields = res.fields.map(field => ({
        Key: field.key,
        Type: schemaCache.get(field.type),
        IsList: field.isList,
        Optional: field.optional,
        Immutable: field.immutable,
        DefaultValue: field.defaultValue,
      }));

      // add deps for behaviors
      // TODO: belongs here?
      if (res.timestamp) {
        fields.createdAt = {Type: schemaCache.get('core:timestamp'), Mutable: false };
        fields.updatedAt = {Type: schemaCache.get('core:timestamp'), Mutable: true };
      }
      if (res.slugField) {
        fields.slug = {Type: schemaCache.get('core:string'), Mutable: true }
      }

      // wait for stuff
      for (const field of fields) {
        field.Type = await field.Type;
      }
      const baseSchema = await schemaCache.get(res.base);

      return await package.HAS_NAME.newRecordSchema({
        Name: res.name,
        Version: res.version,
        Base: baseSchema,
        Fields: fields,
        TimestampBehavior: res.timestamp,
        SlugBehavior: res.slugField ? {Field: res.slugField} : null,
      });
    }

    const schemaNames = new Map;
    for (const res of resources.CustomRecord) {
      schemaNames.set(res.name, res);
    }

    async function loadRecordSchema(name) {
      if (name.startsWith('core:')) {
        return { BuiltIn: name[5].toUpperCase() + name.slice(6) };
      } else if (name.includes(':')) {
        throw new Error(`recordSchema ${JSON.stringify(name)} scoping not implemented`);
      } else if (schemaNames.has(name)) {
        const schema = await createRecordSchema(schemaNames.get(name));
        return { SchemaRef: schema };
      } else {
        throw new Error(`Didn't find record schema ${name}`);
        //const schema = await package.HAS_NAME.findRecordSchema({
        //  Name: name,
        //});
        //return { SchemaRef: schema };
      }
    }
    const schemaCache = new LoaderCache(loadRecordSchema);

    for (const res of resources.CustomRecord) {
      await schemaCache.get(res.name);
    }


    for (const res of resources.ServerMethod) {
      await package.HAS_NAME.newServerMethod({
        Name: res.name,
        Version: res.version,
        ...inflateScript(res.coffee, res.js),
      });
    }


    async function mapDocLocator(child) {
      const typeRef = await schemaCache.get(child.recordType)
      const children = await Promise.all(child.children.map(mapDocLocator));
      return {
        Children: children,
        FilterBy: child.filterBy,
        Fields: (child.fields||'').length > 2 ? child.fields : null,
        SortBy: (child.sortBy||'').length > 2 ? child.sortBy : null,
        LimitTo: child.limitTo || null,
        RecordType: typeRef,
      };
    }
    for (const res of resources.Publication) {
      const rootLocator = await mapDocLocator(res);
      await package.HAS_NAME.newPublication({
        Name: res.name,
        Version: res.version,
        ...rootLocator,
      });
    }


    for (const res of resources.Template) {
      await package.HAS_NAME.newTemplate({
        Name: res.name,
        Version: res.version,
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
            ...inflateScript(script.coffee, script.js),
          };
        }),
      });
    }


    for (const res of resources.RouteTable) {
      const router = await package.HAS_NAME.newAppRouter({
        Name: 'RootRoutes',
        Version: res.version,
        IconUrl: manifest.meta.iconUrl,
        RouteTable: [],
      });

      if (res.layout) {
        router.DefaultLayout = await package.HAS_NAME.findTemplate({
          Name: res.layout,
        });
      }

      for (const route of res.entries) {
        switch (route.type) {
          case 'customAction':
            const {coffee, js} = route.customAction;
            await router.RouteTable.push({
              Path: route.path,
              Action: {
                Script: inflateScript(coffee, js),
              },
            });
            break;
          case 'template':
            await router.RouteTable.push({
              Path: route.path,
              Action: {
                Render: {
                  Template: await package.HAS_NAME.findTemplate({
                    Name: route.template,
                  }),
                },
              },
            });
            break;
          default:
            throw new Error('unknown route type '+route.type);
        }
      }
    }

    await package.linkScripts();
    return package;
  },

  deflate(graph) {
    throw new Error('#TODO');
  },
};
