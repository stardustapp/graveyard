GraphEngine.attachBehavior('graph-store/v1-beta1', 'Graph', {

  async importExternalGraph(extStore, topNodeId=null) {
    //console.log('new package', extStore.nodes, extStore.edges);
    console.group('Importing external graph into GraphStore');

    // copy all the nodes
    const nodeIdMap = new Map;
    let topNode = null;
    for (const node of extStore.nodes.values()) {
      const isTopNode = (topNodeId !== null) && (node.nodeId === topNodeId);

      const newNode = await this.OWNS.newObject({
        Type: node.type,
        Data: node.data,
      }, isTopNode ? null : node.nodeId);
      nodeIdMap.set(`${node.type}#${node.nodeId}`, newNode);

      // store reference to top node
      if (isTopNode)
        this.TopObject = newNode;
    }

    // and then the relations
    for (const edge of extStore.edges) {
      await this.graphCtx.newEdge({
        subject: nodeIdMap.get(edge.subject),
        predicate: '*'+edge.predicate,
        object: nodeIdMap.get(edge.object),
      });
    }

    await this.graphCtx.flush();
    console.groupEnd();
  },

});
