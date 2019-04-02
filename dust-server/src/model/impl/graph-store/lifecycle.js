const extensions = GraphEngine.extend('graph-store/v1-beta1');
extensions.lifecycle = {

  createFrom(storeImpl) {
    console.log('creating graph store graph');

    const storeEngine = GraphEngine.get('graph-store/v1-beta1');
    // TODO: root the graphStore in the storeImpl

    const rootNode = storeEngine.spawnTop({
      //rootEntry:
    });
    rootNode.storeImpl = storeImpl; // TODO: better way?

    return rootNode;
  },

};
