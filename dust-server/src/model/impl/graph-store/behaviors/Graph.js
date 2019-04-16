GraphEngine.attachBehavior('graph-store/v1-beta1', 'Graph', {

  async importExternalGraph(extStore, topNodeId=null) {
    //console.log('new package', extStore.nodes, extStore.edges);
    console.group('Importing external graph into GraphStore');

    // copy all the nodes
    const nodeIdMap = new Map;
    let topNode = null;
    for (const node of extStore.nodes.values()) {
      const newNode = await this.OWNS.newObject({
        Type: node.type,
        Data: node.data,
      });
      nodeIdMap.set(`${node.type}#${node.nodeId}`, newNode);

      // store reference to top node
      if (topNodeId !== null && node.nodeId === topNodeId) {
        this.TopObject = newNode;
      }
    }

    // and then the relations
    for (const edge of extStore.edges) {
      const subject = nodeIdMap.get(edge.subject);
      const object = nodeIdMap.get(edge.object);
      await subject.REFERENCES.newEdge({
        Subject: subject,
        Predicate: edge.predicate,
        Object: object,
      });
    }

    this.graphCtx.flushNodes();

    console.groupEnd();
  },

});
