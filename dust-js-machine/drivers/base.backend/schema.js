CURRENT_LOADER.attachModel(async build => {
  //const structural = await build.loadTypeset('structural');
  // await build.withDriverDep('typeset.structural');
  // await build.withDriverDep('typeset.structural');
  await build.usingTypeset('fields');
  //await build.withDriver('functional');

  // build.nameFunction('CompileDriver', {
  //   input: 'base.base/LoadApi',
  //   output: 'base.base/EntityProvider',
  //   impl(input) {
  //     throw new Error('TODO: base.typeset BuildDriver()');
  //   }});

  // build.nameInterface('BackendDriver', {
  //   bases: ['base.base/EntityProvider'],
  //   methods: {
  //     'CreateNew': {
  //       input: 'base.base/String',
  //       output: 'Document',
  //     },
  //   },
  // });

  build.nameInterface('Instance', {
    methods: {
      'FetchDocument': {
        input: 'base.base/String',
        output: 'Document',
      },
    },
  });

  build.nameDataType('Document', {
    fields: {
      Driver: String,
      Type: String,
      DataSnapshot: JSON,
    },
    methods: {
      'FetchData': {
        output: JSON,
      },
      'StoreData': {
        input: JSON,
      },
      'AddRelation': {
        input: { reference: 'Document' },
      },
      'ListRelations': {
        input: { reference: 'Document' },
      },
      'DeleteDoc': {},
    },
  });

});
