new GraphEngineBuilder('dust-manager/v1-beta1', build => {

  build.node('Manager', {
    relations: [
      { predicate: 'TOP' },
    ],
    fields: {
      Sources: { reference: 'Repository', isList: true },
    },
  });

  build.node('Repository', {
    fields: {
      Label: String,
      Location: { anyOfKeyed: {
        S3Bucket: { fields: {
          BucketOrigin: String,
          ObjectPrefix: String,
        }},
      }},
    },
    // TODO: support prefab objects like this (no impl yet)
    prefabs: {
      public: {
        Label: 'Public Store',
        Location: {
          S3Bucket: {
            BucketOrigin: 'https://stardust-repo.s3.amazonaws.com',
            ObjectPrefix: 'packages/',
          },
        },
      },
    },
  });

}).install();
