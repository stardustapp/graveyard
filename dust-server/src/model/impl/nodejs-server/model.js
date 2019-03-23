new GraphEngineBuilder('nodejs-server/v1-beta1', (build, ref) => {

  build.node('Instance', {
    relations: [
      { predicate: 'TOP', exactly: 1 },
      { predicate: 'OPERATES', object: 'Engine' },
      { predicate: 'HAS', object: 'Entry' },
    ],
    fields: {
      CreatedAt: { type: Date },
      GitHash: { type: String },
      Config: { fields: {
        DataPath: { type: String, optional: true },
        Command: { type: String },
        PackageKey: { type: String, optional: true },
        MethodName: { type: String, optional: true },
        HttpPort: { type: Number, optional: true },
        HttpHost: { type: String, optional: true },
      }},
      Host: { fields: {
        Platform: { type: String },
        Release: { type: String },
        Architecture: { type: String },
        Runtime: { type: String },
        HostName: { type: String },
        UserName: { type: String },
        WorkDir: { type: String },
      }},
    },
  });

  build.node('Engine', {
    relations: [
      { predicate: 'BUILT', object: 'Object' },
      { exactly: 1, subject: 'Instance', predicate: 'INCLUDES' },
    ],
    fields: {
      Driver: { type: String },
      Origin: { anyOfKeyed: {
        // compiled into the runtime
        BuiltIn: { type: String },
        // immediately downloadable
        External: { fields: {
          Uri: { type: String },
          Accessed: { type: Date },
        }},
      }},
    },
  });

  build.node('Entry', {
    relations: [
      { predicate: 'HAS_NAME', object: 'Entry', uniqueBy: 'Name' },
      { predicate: 'POINTS_TO', atMost: 1, object: 'Object' },
      { exactly: 1, subject: 'Instance', predicate: 'INCLUDES' },
    ],
    fields: {
      Entry: { type: String },
    },
  });

  build.node('Object', {
    relations: [
      { subject: 'Object', predicate: 'POINTS_TO' },
      { predicate: 'POINTS_TO', object: 'Object' },

      { subject: 'Entry', predicate: 'POINTS_TO' },
      { exactly: 1, subject: 'Engine', predicate: 'BUILT' },
    ],
    fields: {
      Type: { type: String },
      Data: { type: String },
    },
  });
}).install();
