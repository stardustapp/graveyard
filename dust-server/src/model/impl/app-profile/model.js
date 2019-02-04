class AppProfileLink extends GraphObject {
  constructor(type, data) {
    super(type, data);
    console.log('constructing AppProfileLink', data);
  }
}

new GraphEngineBuilder('app-profile/v1-beta1', build => {

  build.node('Instance', {
    treeRole: 'root',
    fields: {
      IconUrl: { type: String },
      Source: { anyOfKeyed: {
        DustApp: { reference: {
          engine: 'dust-app/v1-beta1',
          type: 'AppRouter',
        }},
      }},
      // more about what push/pull operations should be enabled
      Privacy: { type: String, choices: [
        'private',
        'public read-only',
        'public interactive',
      ]},
    },
  });

  build.node('Link', {
    treeRole: 'leaf',
    behavior: AppProfileLink,
    fields: {
      Target: { anyOfKeyed: {
        // TODO: LocalTree: { reference: 'TreeStore' },
        // TODO: LocalCollection: { reference: 'DocumentStore' },
        LegacyDDP: { fields: {
          SocketBaseUrl: String,
          AppId: String,
          Schemas: { reference: {
            engine: 'dust-app/v1-beta1',
            type: 'RecordSchema',
          }, isList: true },
        }},
        /* TODO
        Skylink: { fields: {
          Endpoint: String,
          AuthToken: { type: String, optional: true },
        }},
        */
      }},
    },
  });

  // TODO
  build.node('DocumentStore', {
    treeRole: 'leaf',
    fields: {
      Schemas: { reference: true, isList: true },
    },
  });

  // TODO
  build.node('TreeStore', {
    treeRole: 'leaf',
    fields: {
    },
  });

}).install();
