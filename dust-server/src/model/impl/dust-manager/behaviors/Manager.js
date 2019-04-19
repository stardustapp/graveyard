GraphEngine.attachBehavior('dust-manager/v1-beta1', 'Manager', {

  fetchManifest(appKey) {
    if (this.Sources.length === 0) throw new Error(
      `Zero Dust Repositories registered, can't fetch anything`);

    console.log('hi! finding', appKey, 'from', this.Sources.length, 'sources');
    throw new Error('TODO: fetchManifest');
    //`${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appKey)}.json`
  },

  async findOrInstallByPackageKey(graphWorld, appKey) {
    const existing = await graphWorld.findGraph({
      engineKey: 'dust-app/v1-beta1',
      fields: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
      },
    });
    if (existing) return existing;

    const newInstall = await this.installWithDeps(graphWorld, appKey);
    if (newInstall) return newInstall;

    throw new Error(
      `App installation ${JSON.stringify(appKey)} not found`);
  },

  // actually use the repository to 'install' apps
  async installWithDeps(graphWorld, appKey) {

    // download the manifest
    const {manifest, sourceUrl, headers} = await this.fetchManifest(appKey);

    // pre-install any dependencies
    const dependencies = {};
    for (const res of manifest.resources) {
      if (res.type !== 'Dependency') continue;
      if (res.childPackage === appKey) continue; // 'Self' dependencies (pre-"my:")
      console.info('Checking package', res.childPackage, 'for Dependency', res.name, 'of', appKey);

      // store the dep for the codec to reference
      const depPkg = await this.findOrInstallByPackageKey(graphWorld, res.childPackage);
      dependencies[res.childPackage] = depPkg;
    }

    const graph = await graphWorld.findOrCreateGraph({
      engineKey: 'dust-app/v1-beta1',
      selector: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
      },
      fields: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
        originUrl: sourceUrl,
        originETag: headers.get('ETag'),
        originVersionId: headers.get('x-amz-version-id'),
      },
      buildCb: async (engine, fields) => {
        // fill out a graphBuilder for the app
        const {pocCodec} = GraphEngine.get('dust-app/v1-beta1').extensions;
        return await pocCodec.inflate(manifest, dependencies);
      },
    });

    return graph;
  },

});
