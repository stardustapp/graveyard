const extensions = GraphEngine.extend('graph-store/v1-beta1');
extensions.lifecycle = {

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

    const topRelation = Array
      .from(storeImpl.engine.edges)
      .find(x => x.type === 'Top');

    // write a new top in forcibly
    worldObj = await storeImpl.transact('write top', async dbCtx => {
      const type = topRelation.topType;
      const proxyHandler = new NodeProxyHandler(type);
      const rootNode = proxyHandler.wrap(null, 'top', type.name, {});
      const rootObj = storeImpl.engine.spawnObject(rootNode, type);
      await dbCtx.storeNode(rootObj);
      return rootObj;
    });

    worldObj.storeImpl = storeImpl; // TODO: better way?
    return worldObj;
  },

};
