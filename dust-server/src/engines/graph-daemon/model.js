new GraphEngineBuilder('graph-daemon/v1-beta1', (build, ref) => {

  build.node('Instance', {
    relations: [
      { kind: 'top', exactly: 1 },
      //{ predicate: 'OPERATES', object: 'Graph' },
      //{ predicate: 'HAS_NAME', object: 'Entry' },
    ],
    fields: {
      CreatedAt: { type: Date },
      LaunchFlags: { type: JSON },
      Config: { fields: {
        Command: { type: String, choices: [ 'serve', 'run' ] },
        MainEngine: { type: String, default: 'graph-daemon/v1-beta1' },
        DataPath: { type: String, optional: true },
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
        HomeDir: { type: String },
      }},
    },
  });

}).install();
