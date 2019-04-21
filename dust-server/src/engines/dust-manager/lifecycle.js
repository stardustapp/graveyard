const extensions = GraphEngine.extend('dust-manager/v1-beta1');
extensions.lifecycle = {

  async buildNew(manager, {fields}) {
    console.log('building new dust manager with fields:', fields);

    const publicSource = await manager.Sources.push({
      Label: 'Public Store',
      Location: {
        S3Bucket: {
          BucketOrigin: 'https://stardust-repo.s3.amazonaws.com',
          ObjectPrefix: 'packages/',
        },
      },
    });
  },

};
