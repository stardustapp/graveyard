const extensions = GraphEngine.extend('graph-store/v1-beta1');
extensions.lifecycle = {

  async buildStore(rawStoreClass, coreEngine, storeOpts={}) {
    const rawStore = await rawStoreClass.new({
      engineKey: 'graph-store/v1-beta1',
      topData: {
        CoreEngine: {

        },
        ExposedRoot: {
          Name: 'graph world',
        },
        InspectRoot: {
          Name: 'graph world',
        },
      },
      ...storeOpts,
    });
    return rawStore;
  },

  async createFrom(storeImpl) {
    console.log('creating graph store graph');

    const oldTop = await storeImpl.transact('read top', async dbCtx => {
      try {
        return await dbCtx.getNodeById('top');
      } catch (err) {
        if (err.status === 404)
          return false;
        throw err;
      }
    });

    if (oldTop) {
      // TODO: inspect for compatibility
      console.warn('TODO: look at worldNode');
    }

    const worldObj = await storeImpl.replaceTop({
      RootEntry: {
        Name: 'world',
      },
    });
    await worldObj.setUp();
    return worldObj;
  },

};
