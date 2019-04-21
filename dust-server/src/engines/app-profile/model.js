new GraphEngineBuilder('app-profile/v1-beta1', build => {

  build.node('Instance', {
    relations: [
      { kind: 'top' },
      { predicate: 'POINTS_TO', atMost: 1, object: 'Link' },
      { predicate: 'HAS_NAME', object: 'LocalCollection' },
      { predicate: 'HAS_NAME', object: 'LocalTree' },
    ]
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
    relations: [
      { exactly: 1, subject: 'Instance', predicate: 'POINTS_TO' },
    ],
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
    relations: [
      { subject: 'Instance', predicate: 'HAS_NAME' },
      { subject: 'Link', predicate: 'REFERENCES' },
    ],
    behavior: AppProfileLocalCollection,
    fields: {
      Schemas: { reference: true, isList: true },
    },
  });

  // TODO
  build.node('LocalTree', {
    relations: [
      { subject: 'Instance', predicate: 'HAS_NAME' },
      { subject: 'Link', predicate: 'REFERENCES' },
    ],
    fields: {
    },
  });

}).install();
