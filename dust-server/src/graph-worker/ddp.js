class DDPManager {
  constructor(graphStore, graphFetcher) {
    this.graphStore = graphStore;
    this.fetchGraphFor = graphFetcher;

    this.sessions = new Map; // id -> DDPSession
    //this.subscriptions = new Set; // of DDPSubscription
    this.api = new PathRouter;

    this.api.registerHandler('/sockjs/info', async match => {
      var array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return new Response(JSON.stringify({
        websocket: false,
        origins: ['*:*'],
        cookie_needed: false,
        entropy: array[0],
      }));
    });

    this.api.registerHandler('/sockjs/:server/:session/xhr', async ({params}, {request}) => {
      const sessionId = params.get('session');
      const serverId = params.get('server');

      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        return session.nextPollResponse();
      } else {
        const session = new DDPSession({
          manager: this,
          request, serverId, sessionId,
        });
        this.sessions.set(sessionId, session);
        return new Response('o\n');
      }
    });

    this.api.registerHandler('/sockjs/:server/:session/xhr_send', async ({params}, {request}) => {
      const sessionId = params.get('session');
      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        await session.processPollSend(await request.json());
        return new Response(null, {status: 204});
      } else {
        return new Response('no such session', {status: 400});
      }
    });
  }
}


// mapping from packet 'msg'
const DdpPacketFuncs = {

  async connect(packet) {
    const {version, support} = packet;
    if (version !== '1') throw new Error(
      `bad sockjs version ${JSON.stringify(version)}, expected '1'`);

    await this.ready; // why not?

    this.queueResponses(
      {server_id: "0"},
      {msg: 'connected', session: this.session},
    );
  },

  async sub(packet) {
    const {id, name, params} = packet;

    switch (name) {
      case '/legacy-dust-app-data':
        const subscription = new DDPLegacyDustAppDataSub(this, packet);
        await subscription.start();
        this.queueResponses({
          msg: 'ready',
          subs: [id],
        });
        break;

      default:
        // refuse the subscription by default
        this.queueResponses({
          msg: 'nosub',
          id: id,
          error: {
            errorType: 'Meteor.Error',
            error: 'missing-impl',
            reason: `Subscription ${name} is not implemented.`,
            message: `Subscription ${name} is not implemented. [missing-impl]`,
            isClientSafe: true,
          }});
    }
  },

  unsub({id}) {
    const sub = this.subs.get(id);
    return sub.unsub();
  },

  ping(packet) {
    this.queueResponses({msg: 'pong'});
  },
}

class DDPSession {
  constructor({manager, request, serverId, sessionId}) {
    this.manager = manager;
    this.originalReq = request;
    this.serverId = serverId;
    this.sessionId = sessionId;

    this.session = randomString();
    this.outboundQueue = [];
    this.waitingPoll = null;
    this.closePacket = null;
    // [1000, 'Normal closure']
    // [3000, 'No response from heartbeat']

    this.subscriptions = new Map;

    // Livedata state-keeping
    this.collections = new Map;
    const ddp = this;
    this.getCollection = function (collName) {
      if (this.collections.has(collName))
        return this.collections.get(collName);
      const collection = {
        collName: collName,
        documents: new Map,

        presentFields(id, presenter, fields) {
          if (!this.documents.has(id)) {
            const doc = {
              presents: new Map,
              allFields: new Map,
            };
            this.documents.set(id, doc);

            doc.presents.set(presenter, fields);
            for (const key of Object.keys(fields)) {
              doc.allFields.set(key, fields[key]);
              // TODO: deep copy?
            }

            ddp.queueResponses({
              msg: 'added',
              collection: collName,
              id: id,
              fields: fields,
            });
          } else {
            console.log('this is a repeat doc', id);
            const doc = this.documents.get(id);
            if (doc.presents.has(presenter)) throw new Error(
              `The given presenter already presented a copy of record ${id}`);

            doc.presents.set(presenter, fields);
            const differs = false;
            for (const key of Object.keys(fields)) {
              if (doc.allFields.get(key) === fields[key])
                continue;
              console.log('field', key, 'was', doc.allFields.get(key), 'is now', fields[key]);
              differs = true;
            }
            if (differs) throw new Error(
              `doc multi-present TODO (different field values!)`);
          }
        },

        purgePresenter(presenter) {
          console.log('purging presenter', presenter);
          let cleaned = 0;
          let retracted = 0;
          for (const [id, doc] of this.documents) {
            if (!doc.presents.has(presenter))
              continue;

            doc.presents.delete(presenter);
            cleaned++;

            if (doc.presents.size === 0) {
              retracted++;
              ddp.queueResponses({
                msg: 'removed',
                collection: collName,
                id: id,
              });
              this.documents.delete(id);

            } else {
              console.log('doc', id, `is still presented by`, doc.presents.size, 'presenters');
              // todo: build new allFields and diff that down
              // todo: how do we know if they're presenting the exact same thing?
              for (const key of Object.keys(fields)) {
                console.log('field', key, 'was', doc.allFields.get(key));
              }
              throw new Error(`doc multi-present TODO`);
            }
          }
          console.log('cleaned', cleaned, 'docs, retracting', retracted);
        },

      };
      this.collections.set(collName, collection);
      return collection;
    }

    // grab and init the relevant graph async
    this.ready = (async () => {
      // get a context on the relevant graph
      this.context = await this.manager
        .fetchGraphFor(request.referrer);
      this.api = this.context.engine.extensions.ddpApi;
      if (!this.api) {
        console.warn(`DDPSession for ${this.context.engine.engineKey} missing ddp api`);
        this.api = {};
      }

      if ('init' in this.api) {
        await this.api.init.call(this, request);
      }

    })();
  }

  queueResponses(...packets) {
    packets
      .filter(pkt => pkt.msg !== 'pong')
      .forEach(pkt => console.debug('>>', pkt));
    packets = packets
      .map(p => JSON.stringify(p));

    if (this.waitingPoll) {
      const resolve = this.waitingPoll;
      this.waitingPoll = null;
      resolve(new Response(`a${JSON.stringify(packets)}\n`));
    } else {
      packets.forEach(packet => {
        this.outboundQueue.push(packet);
      });
    }
  }

  async processPollSend(input) {
    for (const pkt of input.map(JSON.parse)) {
      if (pkt.msg !== 'ping')
        console.debug('<<', pkt);

      const apiName = `${pkt.msg}Pkt`;
      try {
        if (apiName in this.api) {
          const ok = await this.api[apiName].call(this, pkt);
          if (ok) continue;
        }
      } catch (err) {
        console.error('DDP packet failure:', pkt, err);
      }

      const func = DdpPacketFuncs[pkt.msg];
      if (func) {
        try {
          await func.call(this, pkt);
        } catch (err) {
          console.error('DDP packet failure:', pkt, err);
        }
      } else {
        console.warn('weird sockjs packet', pkt);
      }
    }
  }

  async nextPollResponse() {
    // immediate return if closed
    if (this.closePacket && this.outboundQueue.length === 0) {
      return new Response(`c${this.closePacket}\n`);
    }

    // immediate return if data is queued
    if (this.outboundQueue.length) {
      const queue = this.outboundQueue;
      this.outboundQueue = [];
      return new Response(`a${JSON.stringify(queue)}\n`);
    }

    // wait for new stuff
    return new Promise(resolve => {
      setTimeout(() => {
        if (this.waitingPoll === resolve) {
          this.waitingPoll = null;
          resolve(new Response('h\n'));
          console.debug('keeping alive xhr');
        }
      }, 5000);
      if (this.waitingPoll) throw new Error(
        `concurrent xhr polling??`);
      this.waitingPoll = resolve;
    });

    //const sleep = m => new Promise(r => setTimeout(r, m));
    //await sleep(30000);
    //return new Response('h\n');
  }
}

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