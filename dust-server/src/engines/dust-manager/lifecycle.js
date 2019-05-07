const extensions = GraphEngine.extend('dust-manager/v1-beta1');
extensions.lifecycle = {

  buildNew(graphCtx, opts) {
    return graphCtx.newTopNode({
      GitHash: opts.gitHash,
      Sources: [{
        Label: 'Public Store',
        Location: {
          S3Bucket: {
            BucketOrigin: 'https://stardust-repo.s3.amazonaws.com',
            ObjectPrefix: 'packages/',
          },
        },
      }],
    });
  },

};
