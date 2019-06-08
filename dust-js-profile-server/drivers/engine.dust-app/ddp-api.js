/*
 * This DDP API serves up the resources (aka source code) of a DUST app
 * It's used by build-ng and other DUST apps with the `build-` prefix
 */

GraphEngine.extend('dust-app/v1-beta1').ddpApi = {

  async methodPkt(packet) {
    if (packet.method === '/Astronomy/execute') {
      const {
        className, id,
        methodName, methodArgs,
      } = packet.params[0];

      function unwrapArg(arg, ifClass=null) {
        if (arg && arg.$type === 'Astronomy') {
          if (ifClass && arg.$value.class !== ifClass) throw new Error(
            `unwrapArg() got a ${arg.$value.class} but was asked for ${ifClass}`)
          return JSON.parse(arg.$value.values);
        }
        return arg;
      }

      const isPackage = ['Package', 'App', 'Library'].includes(className);
      const document = unwrapArg(methodArgs[0], className);
      const {_id, packageId, version, name, type, ...fields} = document
      const isUpdate = version > 0;

      if (isPackage) throw new Error(
        `TODO: astronomy methods on dust packages`);
      
      const graph = await this.manager.graphStore.findGraph({
        engineKey: 'dust-app/v1-beta1',
        fields: {
          foreignKey: packageId,
        },
      });
      
      const result = await this.manager.graphStore.transact('readwrite', async txn => {
        if (isUpdate) {
          const object = graph.objects.get(_id);

          // TODO: make these DDP errors
          if (!object) throw new Error(
            `Object ${_id} not found, cannot update`);
          if (object.data.name !== name) throw new Error(
            `You tried renaming ${object.data.name} to ${name} which isn't implemented`);
          if (object.data.type !== type) throw new Error(
            `You tried changing a ${object.data.type} to ${type} which isn't implemented`);

          const newVersion = await txn.replaceFields(object, version, fields);
          console.log('committed version', newVersion, fields, 'over', object.data.fields);
          return {version: newVersion};

        } else {
          console.error('TODO: not creating', className, fields, 'on', graph);
          return {}
        }
      });

      this.queueResponses({
        msg: 'result',
        id: packet.id,
        result,
      });
      // TODO: don't delay once reactivity works
      setTimeout(() => {
        this.queueResponses({
          msg: 'updated',
          methods: [packet.id],
        });
      }, 2000);
      return true;

    } else {
      console.log('local method', packet.method, packet.params);
    }
  },
  
  async subPkt(packet) {
    if (packet.name !== '/legacy-dust-app-data')
      return false;

    const sub = new DDPSubscription(this, packet);
    const pkgColl = sub.getCollection('packages');
    const resColl = sub.getCollection('resources');

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
