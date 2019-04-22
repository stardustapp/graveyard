const extensions = GraphEngine.extend('graph-store/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, opts) {
    const world = await graphCtx.migrateTopNode(async prevWorld => {
      if (prevWorld) {
        //console.log('migrating from previous world top', prevWorld, 'with opts', opts);
        // TODO: inspect for engine compatibility?

      } else {
        console.log('creating new world top with opts', opts);
        const newWorld = await graphCtx.newTopNode({
          /*CoreEngine: {

          },*/
          ExposedRoot: {
            Name: 'graph world exposed',
            Self: { Directory: true },
          },
          InspectRoot: {
            Name: 'graph world inspect',
            Self: { Directory: true },
          },
        });
      }
    });
    return world;
  },

};
