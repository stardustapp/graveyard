class DDPManager {
  constructor(graphStore, contextFunc) {
    this.graphStore = graphStore;
    this.contexts = new LoaderCache(contextFunc);

    this.sessions = new Map; // id -> DDPSession
    this.subscriptions = new Set; // of DDPSubscription

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

    this.queueResponses(
      {server_id: "0"},
      {msg: 'connected', session: this.session},
    );

    const referrer = PathFragment.parseUri(this.originalReq.referrer);
    const match = referrer.path.matchWith('/~/apps/by-id/:appId/:*rest');
    if (!match.ok) {
      console.warn('DDP session connected from non-app URL');
      return;
    }

    //const appId = match.params.get('appId');
    //this.context = await this.manager.contexts.getOne(appId, appId);
    //this.context.connectSession(this);
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

    // Livedata state-keeping
    this.subscriptions = new Map;
    this.collections = new Map;
  }

  queueResponses(...packets) {
    packets
      .filter(pkt => pkt.msg !== 'pong')
      .forEach(pkt => console.log('>>', pkt));
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
        console.log('<<', pkt);
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
      }, 1000);
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