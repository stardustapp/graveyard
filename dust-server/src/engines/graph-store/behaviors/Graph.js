GraphEngine.attachBehavior('graph-store/v1-beta1', 'Graph', {

  // async setup() {
  //   const world = await this.getGraphCtx().getNodeById('top');
  //   this.innerGraphCtx = await world.getContextForGraph(this);
  // },

  // TODO: only works when extStore is a VolatileBackend
  async importExternalGraph(extStore, topNodeId=null, worldNode) {
    //console.log('new package', extStore.nodeMap, extStore.edgeMap);
    console.group('Importing external graph into GraphStore');
    console.log('External graph has', extStore.nodeMap.size, 'nodes and', extStore.edgeMap.size, 'edges');

    const hostGraphCtx = this.getGraphCtx();
    const extGraphCtx = extStore.newContext();
    const tgtGraphCtx = await worldNode.getContextForGraph(this);

    // spawn all nodes, without data
    const createdPhyNodes = new Map;
    let topNode = null;
    for (const {nodeId, typeName} of extStore.nodeMap.values()) {
      const isTopNode = (topNodeId !== null) && (nodeId === topNodeId);
      const newNode = await this.OWNS.newObject({
        Type: typeName,
        Data: {},
      }, isTopNode ? null : nodeId);
      //console.log('new internal node:', newNode, isTopNode);
      createdPhyNodes.set(nodeId, newNode);

      // store reference to top node
      if (isTopNode)
        this.TopObject = newNode;
    }

    // load up every node that is referenced
    // basically just to rewire the refs
    // this could probably be better
    const relevantObjIds = new Set;
    for (const edge of extStore.edgeMap.values())
      if (edge.specifiers.predicate === 'REFERENCES')
        relevantObjIds.add(edge.specifiers.object);
    const refIdMap = new Map;
    for (const relevantIdent of relevantObjIds)  {
      //const extNodeIdent = extGraphCtx.identifyNode(refNode);
      //const oldNode = await extGraphCtx.getNodeByIdentity(relevantIdent);
      let oldNode;
      try {
        oldNode = await extGraphCtx.getNodeByIdentity(relevantIdent);
      } catch (err) {
        console.log('WARN: ref to', relevantIdent, `wasn't resolved locally`, err.message);
      }

      if (oldNode && oldNode.ctxId === extGraphCtx.ctxId) {
        const createdPhyNode = createdPhyNodes.get(oldNode.nodeId);
        //console.log('old node', oldNode)
        const tgtNode = await tgtGraphCtx.getNodeById(createdPhyNode.nodeId);
        //console.log('target node', tgtNode)
        const tgtNodeIdent = tgtGraphCtx.identifyNode(tgtNode);
        //console.log('target ident', tgtNodeIdent)
        refIdMap.set(relevantIdent, tgtNodeIdent);
      } else {
        console.log('looking up ref', relevantIdent);
        const parts = relevantIdent.split('#');
        if (parts.length !== 3) throw new Error(
          `that isn't a proper ident for this`)
        //const foreignCtx = GraphContext.forId(oldNode.ctxId);
        const foreignCtx = await worldNode.getContextForGraph({nodeId: parts[0]});
        const foreignNode = await foreignCtx.getNodeById(parts[2]);
        const tgtNodeIdent = tgtGraphCtx.identifyNode(foreignNode);
        refIdMap.set(relevantIdent, tgtNodeIdent);
        console.log('ref resolved to', tgtNodeIdent, 'by', tgtGraphCtx.ctxId)
        //throw new Error(`TODO: cross-ctx reffing in graph import`);
      }
      //console.log('compare', extNodeIdent, tgtNodeIdent)
      //const newNode = await tgtGraphCtx.getNodeById(oldNode.nodeId);
    }

    // copy all the nodes
    const nodeIdMap = new Map;
    for (const nodeId of extStore.nodeMap.keys()) {
      const isTopNode = (topNodeId !== null) && (nodeId === topNodeId);
      const extNode = await extGraphCtx.getNodeById(nodeId);
      const extNodeIdent = extGraphCtx.identifyNode(extNode);
      //console.log('storing external node', extNode);
      const newNode = createdPhyNodes.get(nodeId);
      newNode.Data = await extNode.exportData({
        refMapper(refId) {
          if (refIdMap.has(refId)) {
            console.log('refMapper() resolving refId', refId, 'as', refIdMap.get(refId));
            return refIdMap.get(refId);
          }
          if (refId.startsWith('@')) {
            const realNode = tgtGraphCtx.getNodeByIdentity(refId);
            const realIdent = realNode.getGraphCtx().identifyNode(realNode);
            console.log('refMapper() resolved refId', refId, 'as', realIdent);
            return realIdent;
          }
          throw new Error('refMapper() got weiord ref', refId)
          // const extRecord = await extGraphCtx.getNodeByIdentity(refId);
          // console.log('62622', extRecord.rawData, refId)
          // const newVirtId = tgtGraphCtx.identifyNode(extRecord);
          // console.log('mapping ref', refId, 'to', newVirtId);
          // return 'TODO#FOO';
        },
      });
      //console.log('new imported node:', newNode)
      nodeIdMap.set(extNodeIdent, newNode);
    }

    function findNodeByIdent(ident) {
      if (nodeIdMap.has(ident))
        return nodeIdMap.get(ident);
      if (refIdMap.has(ident))
        return tgtGraphCtx.getNodeByIdentity(refIdMap.get(ident));
      throw new Error(`Graph import findNodeByIdent couldn't find ${ident}`);
    }

    // TODO: relink all the refs using nodeIdMap

    // and then the relations
    for (const [edgeKey, edge] of extStore.edgeMap) {
      console.log('importing edge', edgeKey);

      const subject = findNodeByIdent(edge.specifiers.subject);
      if (!subject) throw new Error(`Didn't find subject for '${edgeKey}'`);
      const object = findNodeByIdent(edge.specifiers.object);
      if (!object) throw new Error(`Didn't find object for '${edgeKey}'`);
      await hostGraphCtx.newEdge({
        subject: `Object#${subject.nodeId}`,
        predicate: '*'+edge.specifiers.predicate,
        object: `Object#${object.nodeId}`,
      });
    }

    await hostGraphCtx.flush();
    await tgtGraphCtx.flush();
    console.groupEnd();
  },

});
