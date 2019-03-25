const {promisify, inspect} = require('util');

class GraphRuntime {
  constructor(graphStore, rootNode) {
    this.graphStore = graphStore;
    this.rootNode = rootNode;

    this.graphs = new Map;
    this.objects = new Map;

    // read in everything
    this.ready = graphStore.mutex.submit('start runtime', this.start.bind(this));
  }

  async start(dbCtx) {
    console.log('Starting GraphRuntime');
    this.graphStore.eventProcessors.push(this.processEvent.bind(this));

    // overwrite whatever top node, don't care
    const rootNode = await dbCtx.storeNode(this.rootNode);

    const allGraphs = await rootNode.OPERATES.fetchGraphList();
    for (const graphNode of allGraphs) {

      //console.log('graphNode', graphNode);
      const graph = new Graph(this, graphNode, GraphEngine.get(graphNode.EngineKey));
      this.graphs.set(graphNode.nodeId, graph);

      // fetch all the objects
      const objects = await graphNode.BUILT.fetchObjectList();

      // construct the objects
      for (const objNode of objects) {
        //console.log('objNode', objNode)
        graph.populateObject(objNode);
      }

      // TODO: relink after everything is loaded
      graph.relink();
    }
    console.debug('Loaded', this.graphs.size, 'graphs containing', this.objects.size, 'objects');
  }

  async processEvent(event) {
    const {timestamp, entries} = event;
    const touchedGraphs = new Set;

    switch (event.kind) {
      case 'put graph':

        const graphEvents = Array
          .from(event.nodeMap.values())
          .filter(x => x.nodeType === 'Graph');
        for (const info of graphEvents) {
          const graphNode = await event.dbCtx.getNodeById(info.nodeId);

          if (this.graphs.has(info.nodeId)) throw new Error(
            `i don't know how to update graphs at runtime yet sry`);
          else {
            console.log('live-importing newly added graph', graphNode.Metadata.foreignKey);
            const graph = new Graph(this, graphNode, GraphEngine.get(graphNode.EngineKey));
            this.graphs.set(graphNode.nodeId, graph);
            touchedGraphs.add(graph);
          }
        }

        const objectEvents = Array
          .from(event.nodeMap.values())
          .filter(x => x.nodeType === 'Object');
        for (const info of objectEvents) {
          const objectNode = await event.dbCtx.getNodeById(info.nodeId);

          if (this.objects.has(info.nodeId)) throw new Error(
            `i don't know how to update objects at runtime yet sry`);
          else {

            // todo: easier way to walk in frmo the changed node
            const builtBy = info.actions
              .find(x => x.kind === 'put edge'
                      && x.direction === 'in'
                      && x.record.predicate === 'BUILT'
                      && x.record.subject.startsWith('Graph#'))
              .record.subject.split('#')[1];

            const graph = this.graphs.get(builtBy);
            if (!graph) throw new Error(
              `Huh, runtime got object with an unknown graph.`);

            //console.log('live-importing newly added object', objectNode);
            graph.populateObject(objectNode);
          }
        }
        break;

      default:
        console.warn('"processing" event', event.kind, event.data);
        throw new Error(`event ${event.kind} not implemented`);
    }

    for (const graph of touchedGraphs) {
      graph.relink();
    }
  }

  async findGraph({engine, engineKey, fields}) {
    await this.ready;

    const targetEngine = engine ? engine.engineKey : engineKey;
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.EngineKey === targetEngine)
      .find(x => Object.keys(fields)
        .every(key => x.data.Metadata[key] == fields[key]));
  }

  async findOrCreateGraph(engine, {selector, fields, buildCb}) {
    await this.ready;

    // return an existing graph if we find it
    const existingGraph = await this.findGraph({
      engine,
      fields: selector || fields,
    });
    if (existingGraph) return existingGraph;

    // ok we have to build the graph
    const graphBuilder = await buildCb(engine, fields);
    if (!graphBuilder) throw new Error(
      `Graph builder for ${engine.engineKey} returned nothing`);

    // persist the new graph

    const graphNode = await this.graphStore.transact('readwrite', async dbCtx => {
      const rootNode = await dbCtx.getNode(this.rootNode);
      const graphNode = await rootNode.OPERATES.newGraph({
        EngineKey: engine.engineKey,
        Metadata: fields,
        Origin: { BuiltIn: 'TODO' }, // TODO
      });
      await dbCtx.createObjectTree(graphNode, graphBuilder.rootNode);
      return graphNode;
    });
    const graphId = graphNode.nodeId;
    console.debug('Created graph', graphId, 'for', fields);

    // grab the [hopefully] loaded graph
    if (!this.graphs.has(graphId)) console.warn(
      `WARN: Graph ${graphId} wasn't loaded after creation`);
    return graphNode;
  }

  getGraphsUsingEngine(engineKey) {
    return Array
      .from(this.graphs.values())
      .filter(x => x.data.engine === engineKey);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    GraphRuntime,
  };
}
