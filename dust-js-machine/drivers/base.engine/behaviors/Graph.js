CURRENT_LOADER.attachBehavior(class Graph {
  build({Template}) {
    //this.AllEngines = new Set;
    this.AllNodes = new Set;
    this.AllEdges = new Set;
    this.DirtyNodes = new Set;
    this.NodeBuilders = new Map;
    this.NodesByName = new Map;

    this.PendingTasks = new Set;

    //this.AllEngines.add(Template);
    for (const [name, node] of Template.NodeMap) {
      this.NodesByName.set(name, node);
      this.NodeBuilders.set(node, Template.EngineDriver
        ._makeObjectFactory(name, this
          .AllNodes.add.bind(this.AllNodes)));
    }

    for (const [engineName, depDriver] of Template.EngineDeps) {
      //this.AllEngines.add(depDriver);
      for (const [name, node] of depDriver.NodeMap) {
        this.NodesByName.set(`${engineName}/${name}`, node);
        this.NodeBuilders.set(node, depDriver.EngineDriver
          ._makeObjectFactory(name, this
            .AllNodes.add.bind(this.AllNodes)));
      }
    }
  }

  async settleAllNodes() {
    //console.log('settling', this.AllNodes)
    for (const node of this.AllNodes)
      await node.ready;
  }

  makeObject(name, data) {
    if (!this.NodesByName.has(name)) throw new Error(
      `makeObject() got unknown type '${name}'`);
    return this.createNode(this.NodesByName.get(name), data);
  }

  createNode(node, data) {
    const newNode = this.NodeBuilders.get(node)();

    Object.defineProperty(newNode, 'markDirty', {
      value: () => {
        if (this.DirtyNodes.has(newNode)) return;
        console.log('marking node dirty');
        this.DirtyNodes.add(newNode);
      },
    });
    Object.defineProperty(newNode, 'myFrame', {
      value: this,
    });

    node.mapOut({}, this, newNode);
    for (const key of node.inner.fields.keys()) {
      newNode[key] = data[key];
      //console.log('set', key, 'to', data[key])
    }
    //const dataObj = node.mapIn(data, this, newNode, newNode);

    //console.log('Graph creating node with', data)
    if (typeof newNode.setup === 'function')
      if (newNode.setup.constructor.name === 'AsyncFunction') this
        .startTask(`Setup ${newNode.constructor.name} node`, newNode, 'setup');
      else newNode.setup();

    return newNode;
  }

  async startTask(name, node, funcName='setup') {
    const task = {
      Name: name,
      State: 'Pending',
    };
    this.PendingTasks.add(task);
    try {
      task.Promise = node[funcName](task);
      const result = await task.Promise;
      task.State = 'Completed';
      return result;
    } catch (err) {
      console.log('Graph Task', name, 'crashed:');
      console.log(err.stack);
      throw new Error(`Graph Task crashed`);
    } finally {
      this.PendingTasks.delete(task);
    }
  }

  newEdge({subject, predicate, object, ...extras}) {
    // validate/prepare subject
    if (!subject) throw new Error(`newEdge() requires 'subject'`);
    //if (subject.constructor === GraphNode) {
    //if (subject.constructor !== String) throw new Error(
      //`newEdge() wants a String for subject, got ${subject.constructor.name}`);

    // validate/prepare object
    if (!object) throw new Error(`newEdge() requires 'object'`);
    //if (object.constructor === GraphNode) {
    //   if (object.ctxId === this.ctxId) {
    //     object = this.identifyNode(object);
    //   } else {
    //     const foreignCtx = GraphContext.forId(object.ctxId);
    //     console.log('local', this.constructor.name, this.ctxId, 'other', foreignCtx.constructor.name, object.ctxId);
    //     //throw new Error('cross ctx object')
    //     //if (foreignCtx.phyStoreId)
    //     object = foreignCtx.identifyNode(object);
    //   }
    // }
    // if (object.constructor !== String) throw new Error(
    //   `newEdge() wants a String for object, got ${object.constructor.name}`);

    // create the edge
    //this.AllEdges.set(StoreEdge.identify(edge), edge);
    this.AllEdges.add({subject, predicate, object});

    // TODO: support uniqueBy by adding name to index
    // TODO: support count constraints
    // TODO: look up the opposite relation for constraints
  }

  queryGraph(query) {
    return new GraphEdgeQuery(this, query);
  }
});
