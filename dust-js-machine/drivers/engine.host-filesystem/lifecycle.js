CURRENT_LOADER.attachLifecycle(class Lifecycle {

  async buildNew(graphCtx, {Config}) {
    //console.log('building host-filesystem with', opts);

    //const dirAccessor = graphCtx.findNodeAccessor('Directory');
    //const rootDir = await graphCtx.newNode(dirAccessor, {});

    const mount = await graphCtx.newTopNode({
      Anchor: {
        HostPath: require('path').resolve(Config.RootPath),
      },
      AllowWrites: Config.ReadOnly !== 'yes',
    });
    //mount.Root = await mount.getDirectory('.');await graphCtx.newTypedFields('Directory');
    //const mount = await graphCtx.getNodeById(mount.nodeId);
    //await mount.HOSTS.attachDirectory(mount.Root);
    await mount.ready;
    return mount;
  }

});
