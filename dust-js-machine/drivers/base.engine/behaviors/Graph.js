CURRENT_LOADER.attachBehavior(class Graph {
  build({Template}) {
    //this.AllEngines = new Set;
    this.AllNodes = new Set;
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
});
