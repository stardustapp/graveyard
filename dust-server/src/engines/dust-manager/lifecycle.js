const extensions = GraphEngine.extend('dust-manager/v1-beta1');
extensions.lifecycle = {

  buildNew(graphCtx, opts) {
    console.log('....', opts)
    return graphCtx.newTopNode({
      Sources: opts.Config.Sources.map(source => {
        if (typeof source === 'string') { return {
          Label: source,
          Location: parseSourceString(source),
        }} else return source;
      }),
    });
  },

};

function parseSourceString(source) {
  if (source.startsWith('s3://')) {
    const [bucket, ...parts] = source.slice('s3://'.length).split('/');
    return { S3Bucket: {
      BucketOrigin: `https://${bucket}.s3.amazonaws.com`,
      ObjectPrefix: (parts.length > 0 ? '/' : '') + parts.join('/'),
    }};
  }
  throw new Error(`failed to parse source string ${source}`);
}
