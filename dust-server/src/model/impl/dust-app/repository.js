GraphEngine.extend('dust-app/v1-beta1').pocRepository = {
  bucketOrigin: 'https://stardust-repo.s3.amazonaws.com',
  objectPrefix: 'packages/',

  async listPackages() {
    const resp = await fetch(this.bucketOrigin + `/?prefix=${this.objectPrefix}&list-type=2`);
    if (resp.status !== 200) throw new Error(
      `Stardust Cloud Repo returned HTTP ${resp.status} when listing packages`);

    const rawText = await resp.text();
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(rawText, "application/xml");

    const IsTruncated = doc.querySelector('IsTruncated');
    if (IsTruncated.textContent === 'true') throw new Error(`
      truncated: More than like 1000 package files seen`);

    return Array
      .from(doc.querySelectorAll('Contents'))
      .filter(el => el
        .querySelector('Key').textContent
        .endsWith('.meta.json'))
      .map(el => ({
        packageId: el.querySelector('Key').textContent.slice(9, -10),
        updatedAt: el.querySelector('LastModified').textContent,
        eTag: el.querySelector('ETag').textContent,
        size: parseInt(el.querySelector('Size').textContent),
      }));
  },

  async downloadJsonFile(url) {
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(
      `Stardust Cloud Repo returned HTTP ${resp.status} for ${url}`);
    const contentType = resp.headers.get('content-type');
    if (!contentType.startsWith('application/octet-stream') &&
        !contentType.startsWith('application/json')) throw new Error(
      `Stardust Cloud Repo returned Content-Type ${contentType} for ${url}`);

    let manifest;
    try {
      manifest = await resp.json();
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error(
        `JSON syntax error in DUST manifest ${url}: ${err.message}`);
      throw err;
    }

    // also store version info
    return {
      manifest,
      headers: resp.headers,
    }
  },

  downloadMetadata(appId) {
    return this.downloadJsonFile(`${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appId)}.meta.json`);
  },

  downloadManifest(appId) {
    return this.downloadJsonFile(`${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appId)}.json`);
  },

  // actually use the repository to 'install' apps
  async installWithDeps(store, appId) {
    const engine = GraphEngine.get('dust-app/v1-beta1');
    const graph = await store.findOrCreateGraph(engine, {
      fields: {
        foreignKey: appId,
        heritage: 'stardust-poc',
        originUrl: `${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appId)}.json`,
      },
      buildCb: async (engine, fields) => {
        // download the application's source from the repository
        const {manifest, headers} = await this.downloadJsonFile(fields.originUrl);

        // attach version info to graph
        fields.originETag = headers.get('ETag');
        fields.originVersionId = headers.get('x-amz-version-id');

        // pre-install any dependencies
        const dependencies = {};
        for (const res of manifest.resources) {
          if (res.type !== 'Dependency') continue;
          if (res.childPackage == appId) continue; // 'Self' dependencies (pre-"my:")
          console.info('Checking package', res.childPackage, 'for Dependency', res.name, 'of', appId);
          // store the dep for the codec to reference
          const depPkg = await this.installWithDeps(store, res.childPackage);
          dependencies[res.childPackage] = Array.from(depPkg.roots)[0];
        }

        // fill out a graphBuilder for the app
        const {pocCodec} = GraphEngine.get('dust-app/v1-beta1').extensions;
        return pocCodec.inflate(manifest, dependencies);
      },
    });

    return graph;
  },

};
