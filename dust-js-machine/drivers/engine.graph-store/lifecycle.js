CURRENT_LOADER.attachLifecycle(class Lifecycle {

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
        console.log('new world:', newWorld.rawData, newWorld.ExposedRoot)

        newWorld.InspectRoot.HAS_NAME.newEntry({
          Name: 'all graphs',
          Self: { Directory: true },
        });
        newWorld.InspectRoot.HAS_NAME.newEntry({
          Name: 'all engines',
          Self: { Directory: true },
        });
      }
    });
    return world;
  }

});
