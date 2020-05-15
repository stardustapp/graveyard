CURRENT_LOADER.attachModel(async build => {

  build.nameInterface('Typeset', {
    bases: ['base.base/Driver'],
    methods: {
      'ConstructType': {
        input: 'base.base/NativeObjectEntity',
        output: 'base.base/DataTypeEntity',
      },
    },
  });

  // build.nameFunction('CompileDriver', {
  //   input: 'base.base/LoadApi',
  //   output: 'base.base/EntityProvider',
  //   impl(input) {
  //     throw new Error('TODO: base.typeset BuildDriver()');
  //   }});

});
