new GraphEngineBuilder('graph-store/v1-beta1', (build, ref) => {

  build.node('World', {
    relations: [
      { kind: 'top' },
      { predicate: 'OPERATES', object: 'Engine' },
      { predicate: 'STORES', object: 'Graph' },
    ],
    fields: {
      CoreEngine: { reference: 'Engine', optional: true },
      ExposedRoot: { reference: 'Entry', optional: true },
      InspectRoot: { reference: 'Entry', optional: true },
    },
  });

  build.node('Entry', {
    relations: [
      { subject: 'Entry', predicate: 'HAS_NAME' },
      { predicate: 'HAS_NAME', object: 'Entry', uniqueBy: 'Name' },
    ],
    fields: {
      Name: String,
      Graph: { reference: 'Graph', immutable: true, optional: true },
      Self: { anyOfKeyed: {
        Empty: Boolean, // TODO: should be Unit
        //LinkTo: String,
        //LiteralStr: String,
        Data: { fields: {
          Bytes: String,
          Type: { anyOfKeyed: {
            Primitive: String,
            Mime: String,
            //Virtual: { reference: 'Object', optional: true },
          }},
        }},
        /*
        ExposedObj: { reference: 'Object' },
        RelatedList: { fields: {
          Predicate: String,
        }},
        */
      }},
    },
  });

  build.node('Engine', {
    relations: [
      { predicate: 'OPERATES', object: 'Graph' },
      { exactly: 1, subject: 'World', predicate: 'OPERATES' },
    ],
    fields: {
      //Tags: JSON,
      Source: { anyOfKeyed: {
        // meta-engine stored in this world
        Virtual: { reference: 'Object' },
        // compiled into the runtime
        BuiltIn: { fields: {
          GitHash: String,
          EngineKey: String,
        }},
        // immediately downloadable
        Published: { fields: {
          Uri: String,
          Accessed: Date,
        }},
      }},
    },
  });

  build.node('Graph', {
    relations: [
      { predicate: 'OWNS', object: 'Object' },
      { exactly: 1, subject: 'World', predicate: 'STORES' },
      { exactly: 1, subject: 'Engine', predicate: 'OPERATES' },
    ],
    fields: {
      Tags: JSON,
      TopObject: { reference: 'Object', optional: true },
    },
  });

  build.node('Object', {
    relations: [
      { subject: 'Entry', predicate: 'POINTS_TO' },
      { exactly: 1, subject: 'Graph', predicate: 'OWNS' },

      { subject: 'Object', kind: 'any' },
      { kind: 'any', object: 'Object' },
    ],
    fields: {
      Type: String,
      Data: JSON,
    },
  });

}).install();
