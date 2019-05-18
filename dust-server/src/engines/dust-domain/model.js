new GraphEngineBuilder('dust-domain/v1-beta1', (build, ref) => {

  build.node('Domain', {
    relations: [
      { kind: 'top' },
    ],
    fields: {
      DomainName: String,
    },
  });

}).install();
