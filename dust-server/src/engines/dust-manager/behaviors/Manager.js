GraphEngine.attachBehavior('dust-manager/v1-beta1', 'Manager', {

  async fetchManifest(appKey) {
    if (this.Sources.length === 0) throw new Error(
      `Zero Dust Repositories registered, can't fetch anything`);

    for (const sourceRef of this.Sources) {
      const source = await sourceRef;
      console.log('checking source', source.Label, 'for', appKey);

      const manifest = source.fetchManifest(appKey);
      if (manifest)
        return manifest;
    }
    throw new Error(`Dust Manager didn't locate manifest for ${appKey}, checked ${this.Sources.length} sources`);
  },

  findByPackageKey(graphWorld, appKey) {
    return graphWorld.findGraph({
      engineKey: 'dust-app/v1-beta1',
      gitHash: this.GitHash,
      fields: {
        foreignKey: appKey,
        heritage: 'stardust-poc',
      },
    });
  },

  async findOrInstallByPackageKey(graphWorld, appKey) {
    const existing = await this.findByPackageKey(graphWorld, appKey);
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
      const depGraph = await this.findOrInstallByPackageKey(graphWorld, res.childPackage);
      const depCtx = await graphWorld.getContextForGraph(depGraph)
      const depPackage = await depCtx.getTopObject();
      console.log('Found depped pkg:', depPackage);
      dependencies[res.childPackage] = depPackage;
    }

    const graph = await graphWorld.findOrCreateGraph({
      engineKey: 'dust-app/v1-beta1',
      gitHash: this.GitHash,
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
      manifest,
      dependencies,
    });

    return graph;
  },

  async serveAppPage(graphWorld, appKey, meta, responder) {
    const dustGraph = await this.findByPackageKey(graphWorld, appKey);
    if (!dustGraph) {
      return responder.sendJson({
        message: `Application "${appKey}" not installed`,
        status: 404,
      }, 404);
    }

    console.log('serving dust app', dustGraph);
    const appCtx = await graphWorld.getContextForGraph(dustGraph);
    const appPackage = await appCtx.getTopObject();
    console.log('serving dust package', appPackage);

    const {compileToHtml} = GraphEngine.extend('dust-app/v1-beta1');
    const compiled = await compileToHtml(this, dustGraph, appPackage, {
      appRoot: '/raw-dust-app/'+appKey,
      usesLegacyDB: false,
    });
    //console.log('compiled as', compiled);

    return responder.sendHtml(compiled, 200);
  },

});
