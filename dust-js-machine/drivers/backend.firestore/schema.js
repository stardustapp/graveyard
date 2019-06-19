CURRENT_LOADER.attachModel(async build => {
  //build.requireNpmPackage('@google-cloud/firestore');
  await build.withTypeset('structural');

  build.structural('DocStore', {
    instanceOf: [
      { driver: 'base.backend', typeclass: 'DocStore' },
    ],
    fields: {
      'Authentication': { anyOfKeyed: {
        'Environment': Boolean,
        'ServiceAccount': { fields: {
          'ProjectId': String,
          'KeyFilename': String,
        }},
      }},
      'RootDocPath': String,
    },
    methods: {
      'UpdateRoot': {
        input: JSON,
        output: Boolean,
      },
    },
  });

  build.structural('Document', {
    instanceOf: [
      { driver: 'base.backend', typeclass: 'Document' },
    ],
    fields: {
      'Store': { reference: 'DocStore' },
      'FullPath': String,
    },
  });

});
