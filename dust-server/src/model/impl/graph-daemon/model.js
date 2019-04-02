new GraphEngineBuilder('graph-daemon/v1-beta1', (build, ref) => {

  build.node('Instance', {
    relations: [
      { predicate: 'TOP', exactly: 1 },
      //{ predicate: 'OPERATES', object: 'Graph' },
      //{ predicate: 'HAS_NAME', object: 'Entry' },
    ],
    fields: {
      CreatedAt: { type: Date },
      GitHash: { type: String },
      Config: { fields: {
        DataPath: { type: String, optional: true },
        Command: { type: String, choices: [ 'serve', 'run' ] },
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

}).install();
