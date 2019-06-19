CURRENT_LOADER.attachModel(async build => {
  await build.withFieldTypes('structural');
  //build.needsEngine('app-profile');
  build.needsEngine('dust-app');
  build.needsEngine('graph-store');

  build.node('Manager', {
    relations: [
      { kind: 'top' },
      { predicate: 'SERVES', object: 'WebTarget' },
    ],
    fields: {
      //GitHash: String,
      Sources: { reference: 'Repository', isList: true },
      GraphWorld: { reference: {
        engine: 'graph-store',
        name: 'GraphWorld',
      }},
    },
  });

  build.node('Repository', {
    relations: [
      { predicate: 'PROVIDED', object: 'WebTarget' },
    ],
    fields: {
      Label: String,
      Location: { anyOfKeyed: {
        S3Bucket: { fields: {
          BucketOrigin: String,
          ObjectPrefix: String,
        }},
      }},
    },
  });

  build.node('WebTarget', {
    relations: [
      { subject: 'Repository', predicate: 'PROVIDED' },
      { subject: 'Manager', predicate: 'SERVES' },
    ],
    fields: {
      UriOrigin: String,
      BasePath: { type: String, defaultValue: '/' }, // TODO: support defaults like this, at least better error
      Source: { anyOfKeyed: {
        // AppProfile: { reference: {
        //   engine: 'app-profile',
        //   name: 'Instance',
        // }},
        RawDustRouter: { reference: {
          engine: 'dust-app',
          name: 'AppRouter',
        }},
      }},
      PreferredRendering: { type: String, allowedValues: [
        //'FullClientSide',
        'LiveCompiledMeteor',
        //'ServerSide',
      ], defaultValue: 'LiveCompiledMeteor' },
      IncludeServiceWorker: { type: Boolean, defaultValue: false },
      AccessMethods: { anyOfKeyed: {
        Public: Boolean, // TODO: Unit
        IpCidr: String,
        EmailDomain: String,
        EmailAddress: String,
        SharedPassword: String,
        //GoogleGroup: {...},
      }, isList: true },
    },
  });

});
