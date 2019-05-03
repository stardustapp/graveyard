new GraphEngineBuilder('dust-manager/v1-beta1', build => {

  build.node('Manager', {
    relations: [
      { kind: 'top' },
      { predicate: 'SERVES', object: 'WebTarget' },
    ],
    fields: {
      GitHash: String,
      Sources: { reference: 'Repository', isList: true },
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
        AppProfile: { reference: {
          engine: 'app-profile/v1-beta1',
          name: 'Instance',
        }},
        RawDustRouter: { reference: {
          engine: 'dust-app/v1-beta1',
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

}).install();
