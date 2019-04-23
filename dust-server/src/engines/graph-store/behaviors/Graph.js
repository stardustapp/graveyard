GraphEngine.attachBehavior('graph-store/v1-beta1', 'Graph', {

  async importExternalGraph(extStore, topNodeId=null) {
    //console.log('new package', extStore.nodes, extStore.edges);
    console.group('Importing external graph into GraphStore');
    console.log('External graph has', extStore.nodes.size, 'nodes and', extStore.edges.size, 'edges');
    const worldNode = await this.graphCtx.getNodeById('top');

    const extGraphCtx = extStore.newContext();
    const tgtGraphCtx = await worldNode.openSubContext(this);

    // load up every node that is referenced
    // basically just to rewire the refs
    // this could probably be better
    const relevantObjIds = new Set;
    for (const edge of extStore.edges)
      if (edge.predicate === 'REFERENCES')
        relevantObjIds.add(edge.object);
    const reffedNodes = await Promise
      .all(Array
        .from(relevantObjIds)
        .map(ident => extGraphCtx
          .getNodeByIdentity(ident)));
    const refIdMap = new Map;
    for (const refNode of reffedNodes)  {
      const extNodeIdent = extGraphCtx.identifyNode(refNode);
      const tgtNodeIdent = tgtGraphCtx.identifyNode(refNode);
      console.log('compare', extNodeIdent, tgtNodeIdent)
      refIdMap.set(extNodeIdent, tgtNodeIdent);
    }

    // copy all the nodes
    const nodeIdMap = new Map;
    let topNode = null;
    for (const nodeId of extStore.nodes.keys()) {
      const isTopNode = (topNodeId !== null) && (nodeId === topNodeId);
      const extNode = await extGraphCtx.getNodeById(nodeId);
      const extNodeIdent = extGraphCtx.identifyNode(extNode);
      const newNode = await this.OWNS.newObject({
        Type: extNode.nodeType,
        Data: await extNode.exportData({
          async refMapper(refId) {
            return refIdMap.get(refId);
            // const extRecord = await extGraphCtx.getNodeByIdentity(refId);
            // console.log('62622', extRecord.rawData, refId)
            // const newVirtId = tgtGraphCtx.identifyNode(extRecord);
            // console.log('mapping ref', refId, 'to', newVirtId);
            // return 'TODO#FOO';
          },
        }),
      }, isTopNode ? null : nodeId);
      nodeIdMap.set(extNodeIdent, newNode);

      // store reference to top node
      if (isTopNode)
        this.TopObject = newNode;
    }

    // TODO: relink all the refs using nodeIdMap

    // and then the relations
    for (const edge of extStore.edges) {
      console.log('importing edge', edge.subject, edge.predicate, edge.object);

      const subject = nodeIdMap.get(edge.subject);
      if (!subject) throw new Error(`Didn't find subject '${edge.subject}'`);
      const object = nodeIdMap.get(edge.object);
      if (!object) throw new Error(`Didn't find object '${edge.object}'`);
      await this.graphCtx.newEdge({
        subject,
        predicate: '*'+edge.predicate,
        object,
      });
    }

    await this.graphCtx.flush();
    console.groupEnd();
  },

});
