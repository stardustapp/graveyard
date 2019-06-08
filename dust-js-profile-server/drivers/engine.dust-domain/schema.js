CURRENT_LOADER.attachModel(async build => {
  await build.withFieldTypes('structural');

  build.node('Domain', {
    relations: [
      { kind: 'top' },
    ],
    fields: {
      DomainName: String,
      AccessPolicy: String,
    },
  });

});
