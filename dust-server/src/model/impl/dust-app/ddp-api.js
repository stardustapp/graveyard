/*
 * This DDP API serves up the resources (aka source code) of a DUST app
 * It's used by build-ng and other DUST apps with the `build-` prefix
 */

GraphEngine.extend('dust-app/v1-beta1').ddpApi = {

  async subPkt(packet) {
    if (packet.name !== '/legacy-dust-app-data')
      return false;

    const sub = new DDPSubscription(this, packet);
    const pkgColl = sub.getCollection('legacy/packages');
    const resColl = sub.getCollection('legacy/resources');

    for (const graph of this.manager.graphStore.graphs.values()) {
      if (graph.data.engine !== 'dust-app/v1-beta1') continue;

      const rootObj = Array.from(graph.roots)[0];
      const {PackageKey, PackageType, License} = rootObj.data.fields;

      const appRouter = graph.selectNamed('Router');

      pkgColl.presentFields(PackageKey, sub, {
        type: PackageType,
        name: rootObj.data.name,
        license: License,
        libraries: [],
        iconUrl: appRouter ? appRouter.IconUrl : null,
      });

      if (appRouter) {
        let layoutName = null;
        if (appRouter.DefaultLayout) {
          const layout = graph.objects.get(appRouter.DefaultLayout);
          layoutName = layout.data.name;
        }

        resColl.presentFields(appRouter.data.objectId, sub, {
          type: 'RouteTable',
          packageId: PackageKey,
          name: 'RootRoutes',
          version: appRouter.data.version,
          layout: layoutName,
          entries: graph.selectAllWithType('Route').map(({Path, Action}) => {
            if (Action.Script) {
              return {
                path: Path,
                type: 'customAction',
                customAction: {
                  coffee: Action.Script.Coffee,
                  js: Action.Script.Js,
                },
              };
            } else if (Action.Render) {
              const template = graph.objects.get(Action.Render.Template);
              return {
                path: Path,
                type: 'template',
                template: template.data.name,
              };
            }
          }),
        });
      }

      for (const schema of graph.selectAllWithType('RecordSchema')) {
        resColl.presentFields(schema.data.objectId, sub, {
          type: 'CustomRecord',
          packageId: PackageKey,
          name: schema.data.name,
          version: schema.data.version,
          base: schema.Base.SchemaRef
            ? graph.objects.get(schema.Base.SchemaRef).data.name
            : `core:${schema.Base.BuiltIn}`,
          dataScope: 'global',
          fields: schema.Fields.map(field => {
            return {
              key: field.Key,
              type: field.Type.SchemaRef
                ? graph.objects.get(field.Type.SchemaRef).data.name
                : `core:${field.Type.BuiltIn.toLowerCase()}`,
              isList: field.IsList,
              optional: field.Optional,
              immutable: field.Immutable,
              default: field.DefaultValue,
            };
          }),
        });
      }

      for (const template of graph.selectAllWithType('Template')) {
        resColl.presentFields(template.data.objectId, sub, {
          type: 'Template',
          packageId: PackageKey,
          name: template.data.name,
          version: template.data.version,
          html: template.Handlebars,
          css: template.Style.CSS,
          scss: template.Style.SCSS,
          scripts: template.Scripts.map(({Coffee, JS, Refs, Type}) => {
            let key, type, param;
            const typeMap = ['LC-Render', 'LC-Create', 'LC-Destroy', 'Helper', 'Event', 'Hook'];

            if (Type.Helper) {
              key = `helper:${Type.Helper}`;
              type = typeMap.indexOf('Helper');
              param = Type.Helper;

            } else if (Type.Event) {
              key = `event:${Type.Event}`;
              type = typeMap.indexOf('Event');
              param = Type.Event;

            } else if (Type.Hook) {
              key = `hook:${Type.Hook}`;
              type = typeMap.indexOf('Hook');
              param = Type.Hook;

            } else if (Type.Lifecycle) {
              key = `on-${Type.Lifecycle.toLowerCase()}`;
              type = typeMap.indexOf(`LC-${Type.Lifecycle}`);
              param = null;
            }

            return {
              key, type, param,
              coffee: Coffee,
              js: Js,
            };
          }),
        });
      }

      for (const dependency of graph.selectAllWithType('Dependency')) {
        resColl.presentFields(dependency.data.objectId, sub, {
          type: 'Dependency',
          packageId: PackageKey,
          name: dependency.data.name,
          version: dependency.data.version,
          childPackage: dependency.PackageKey,
          isOptional: false,
        });
      }

      function mapChild(child) {
        return {
          recordType: child.RecordType.SchemaRef
            ? graph.objects.get(child.RecordType.SchemaRef).data.name
            : `core:${child.RecordType.BuiltIn}`,
          filterBy: child.FilterBy,
          sortBy: child.SortBy,
          fields: child.Fields,
          limitTo: child.LimitTo,
        }
      }
      for (const publication of graph.selectAllWithType('Publication')) {
        resColl.presentFields(publication.data.objectId, sub, {
          type: "Publication",
          packageId: PackageKey,
          name: publication.data.name,
          version: publication.data.version,
          recordType: publication.RecordType.SchemaRef
            ? graph.objects.get(publication.RecordType.SchemaRef).data.name
            : `core:${publication.RecordType.BuiltIn}`,
          filterBy: publication.FilterBy,
          sortBy: publication.SortBy,
          fields: publication.Fields,
          limitTo: publication.LimitTo,
          children: publication.Children.map(mapChild),
        });
      }

      for (const serverMethod of graph.selectAllWithType('ServerMethod')) {
        resColl.presentFields(serverMethod.data.objectId, sub, {
          type: 'ServerMethod',
          packageId: PackageKey,
          name: serverMethod.data.name,
          version: serverMethod.data.version,
          coffee: serverMethod.Coffee,
          js: serverMethod.JS,
          injects: [],
        });
      }
    }

    sub.ready();
    return true;
  },

};
