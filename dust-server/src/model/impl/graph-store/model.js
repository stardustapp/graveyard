new GraphEngineBuilder('graph-store/v1-beta1', (build, ref) => {

  build.node('World', {
    relations: [
      { predicate: 'TOP' },
      { predicate: 'OPERATES', object: 'Graph' },
    ],
    fields: {
      RootEntry: { reference: 'Entry' },
    },
  });

  build.node('Graph', {
    relations: [
      { predicate: 'BUILT', object: 'Object' },
      { exactly: 1, subject: 'World', predicate: 'OPERATES' },
    ],
    fields: {
      EngineKey: { type: String },
      Metadata: { type: JSON },
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
      { subject: 'Entry', predicate: 'HAS_NAME' },
      { predicate: 'HAS_NAME', object: 'Entry', uniqueBy: 'Name' },

      { predicate: 'POINTS_TO', atMost: 1, object: 'Object' },
      { exactly: 1, subject: 'Graph', predicate: 'BUILT' },
    ],
    fields: {
      Name: { type: String },
    },
  });

  build.node('Object', {
    relations: [
      { subject: 'Object', predicate: 'POINTS_TO' },
      { predicate: 'POINTS_TO', object: 'Object' },

      { subject: 'Entry', predicate: 'POINTS_TO' },
      { exactly: 1, subject: 'Graph', predicate: 'BUILT' },
    ],
    fields: {
      Type: { type: String },
      Fields: { type: JSON },
    },
  });

}).install();
