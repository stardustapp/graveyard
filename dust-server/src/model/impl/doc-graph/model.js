new GraphEngineBuilder('doc-graph/v1-beta1', (build, ref) => {

  build.node('Daemon', {
    relations: [
      { predicate: 'INCLUDES', object: 'Engine' },
      { predicate: 'INCLUDES', object: 'Root' },
    ],
    fields: {
      CreatedAt: { type: Date },
      HostInfo: { fields: {
        Platform: { type: String },
        Release: { type: String },
        Architecture: { type: String },
        Runtime: { type: String },
        Hostname: { type: String },
        Username: { type: String },
      }},
    },
  });

  build.node('Engine', {
    relations: [
      { predicate: 'BUILT', object: 'Node' },
      { exactly: 1, subject: 'Daemon', predicate: 'INCLUDES' },
    ],
    fields: {
      Driver: { type: String },
      Origin: { anyOfKeyed: {
        // compiled into the runtime
        BuiltIn: { fields: {
          Key: { type: String },
          GitHash: { type: String },
        }},
        // immediately downloadable
        External: { fields: {
          Uri: { type: String },
          Accessed: { type: Date },
        }},
      }},
    },
  });

  build.node('Root', {
    relations: [
      { predicate: 'POINTS_TO', atMost: 1, object: 'Node' },
      { exactly: 1, subject: 'Daemon', predicate: 'INCLUDES' },
    ],
    fields: {
      Name: { type: String },
    },
  });

  build.node('Node', {
    open: true,
    relations: [
      { subject: 'Node', predicate: 'POINTS_TO' },
      { predicate: 'POINTS_TO', object: 'Node' },

      { subject: 'Root', predicate: 'POINTS_TO' },
      { exactly: 1, subject: 'Engine', predicate: 'BUILT' },
    ],
  });
}).install();
