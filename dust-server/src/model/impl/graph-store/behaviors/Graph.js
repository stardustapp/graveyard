GraphEngine.attachBehavior('graph-store/v1-beta1', 'Graph', {

  async importExternalGraph(extStore) {
    //console.log('new package', extStore.nodes, extStore.edges);
    console.group('Importing external graph into GraphStore');

    // copy all the nodes
    const nodeIdMap = new Map;
    for (const node of extStore.nodes.values()) {
      const newNode = await this.OWNS.newObject({
        Type: node.type,
        Data: node.data,
      });
      nodeIdMap.set(`${node.type}#${node.nodeId}`, newNode);
    }
    //console.log('Node ID map:', nodeIdMap);

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

    console.groupEnd();
  },

});
