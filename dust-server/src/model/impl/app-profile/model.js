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
    fields: {
      Target: { anyOfKeyed: {
        // TODO: LocalTree: { reference: 'LocalTree' },
        LocalCollection: { reference: 'LocalCollection' },
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
  build.node('LocalCollection', {
    treeRole: 'leaf',
    behavior: AppProfileLocalCollection,
    fields: {
      Schemas: { reference: true, isList: true },
    },
  });

  // TODO
  build.node('LocalTree', {
    treeRole: 'leaf',
    fields: {
    },
  });

}).install();
