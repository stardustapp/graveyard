class DDPSessionDocument {
  constructor(fields) {
    this.fields = fields;

    this.presenters = new Map;
    this.fieldMask = false;
  }

  addPresenter(presenter, opts) {
    if (opts.fieldMask) throw new Error(
      `TODO: fieldMask setup`);
    if (this.presenters.has(presenter)) throw new Error(
      `The given presenter already presented a copy of record ${id}`);
    this.presenters.set(presenter, opts);
  }

  removePresenter(presenter) {
    if (!this.presenters.has(presenter)) throw new Error(
      `Presenter cannot retract document which it was not already presenting`);
    this.presenters.delete(presenter);
  }

  get isAbandoned() {
    return this.presenters.size === 0;
  }

  visibleFields() {
    if (this.fieldMask) throw new Error(
      `TODO: fieldMask usage`);
    return this.fields;
  }
}

// Every document that this class currently holds will be synced to the client.
// Don't give it documents that the client doesn't need to know about.
// You can using multiple presenters to present the same documents twice.
// Each doc-presenter _may_ provide a field mask (like mongoDB 'fields') which filters what is sent.
// Otherwise, if this class holds the document, the client holds the full document too.
class DDPSessionCollection {
  constructor(ddp, collName) {
    this.ddp = ddp;
    this.collName = collName;

    this.documents = new Map;
  }

  presentFields(id, presenter, fields, opts={}) {
    if (this.documents.has(id)) {
      const doc = this.documents.get(id);
      doc.addPresenter(presenter, opts);

      const differs = false;
      for (const key of Object.keys(fields)) {
        if (doc.fields[key] === fields[key])
          continue;
        console.log('field', key, 'was', doc.fields[key], 'is now', fields[key]);
        differs = true;
      }
      if (differs) throw new Error(
        `doc multi-present TODO (different field values!)`);

    } else {
      const doc = new DDPSessionDocument(fields);
      doc.addPresenter(presenter, opts);

      this.documents.set(id, doc);
      this.ddp.queueResponses({
        msg: 'added',
        collection: this.collName,
        id: id,
        fields: doc.visibleFields(),
      });
    }
  }

  // returns true if the document is now removed
  retractFields(id, presenter) {
    if (!this.documents.has(id)) throw new Error(
      `Presenter cannot restract document ${JSON.stringify(id)} as no one has presented it`);

    const doc = this.documents.get(id);
    doc.removePresenter(presenter);

    // clean out the document if it's gone now
    if (doc.isAbandoned) {
      this.ddp.queueResponses({
        msg: 'removed',
        collection: this.collName,
        id: id,
      });
      this.documents.delete(id);
      return true;
    }

    if (doc.fieldMask) throw new Error(
      `TODO: retracted presenter on masked document, needs recalc`);
    return false;
  }

  purgePresenter(presenter) {
    console.log('purging presenter', presenter);
    let cleaned = 0;
    let retracted = 0;
    for (const [id, doc] of this.documents) {
      if (!doc.presenters.has(presenter))
        continue;

      cleaned++;
      if (this.retractFields(id, presenter))
        retracted++;
    }
    console.log('cleaned', cleaned, 'docs from presenter, retracting', retracted);
  }
};

//////////////////////////////////////////////////////////////////////////////
// TODO: below this line is presumably only used for the legacy build-.+ apps

class DDPSubscription {
  constructor(session, {id, name, params}) {
    this.ddp = session;
    this.subId = id;
    this.subName = name;
    this.params = params;
  }

  async start() {
    this.ddp.manager.subscriptions.add(this);
  }

  async stop() {
    this.ddp.manager.subscriptions.delete(this);
  }
}

class DDPLegacyDustAppDataSub extends DDPSubscription {
  async start() {
    super.start();

    for (const graph of this.ddp.manager.graphStore.graphs.values()) {
      if (graph.data.engine !== 'dust-app/v1-beta1') continue;

      const rootObj = Array.from(graph.roots)[0];
      const {PackageKey, PackageType, License} = rootObj.data.fields;

      const appRouter = graph.selectNamed('Router');

      const fields = {
        type: PackageType,
        name: rootObj.data.name,
        license: License,
        libraries: [],
        iconUrl: appRouter ? appRouter.IconUrl : null,
      }
      this.ddp.queueResponses({
        msg: 'added',
        collection: 'legacy/packages',
        id: PackageKey,
        fields,
      });

      if (appRouter) {
        let layoutName = null;
        if (appRouter.DefaultLayout) {
          const layout = graph.objects.get(appRouter.DefaultLayout);
          layoutName = layout.data.name;
        }

        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: appRouter.data.objectId,
          fields: {
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
          },
        });
      }

      for (const schema of graph.selectAllWithType('RecordSchema')) {
        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: schema.data.objectId,
          fields: {
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
          },
        });
      }

      for (const template of graph.selectAllWithType('Template')) {
        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: template.data.objectId,
          fields: {
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
          },
        });
      }

      for (const dependency of graph.selectAllWithType('Dependency')) {
        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: dependency.data.objectId,
          fields: {
            type: 'Dependency',
            packageId: PackageKey,
            name: dependency.data.name,
            version: dependency.data.version,
            childPackage: dependency.PackageKey,
            isOptional: false,
          },
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
        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: publication.data.objectId,
          fields: {
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
          },
        });
      }

      for (const serverMethod of graph.selectAllWithType('ServerMethod')) {
        this.ddp.queueResponses({
          msg: 'added',
          collection: 'legacy/resources',
          id: serverMethod.data.objectId,
          fields: {
            type: 'ServerMethod',
            packageId: PackageKey,
            name: serverMethod.data.name,
            version: serverMethod.data.version,
            coffee: serverMethod.Coffee,
            js: serverMethod.JS,
            injects: [],
          },
        });
      }
    }
  }
}