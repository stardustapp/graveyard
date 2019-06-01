CURRENT_LOADER.attachBehavior(class Graph {
  setup({Template}) {
    this.AllNodes = new Set;
    this.DirtyNodes = new Set;
    this.NodeBuilders = new Map;
    this.NodesByName = new Map;

    for (const [name, node] of Template.NodeMap) {
      this.NodesByName.set(name, node);
      this.NodeBuilders.set(node, Template.EngineDriver
        ._makeObjectFactory(name, this
          .registerNode.bind(this)));
    }
  }

  registerNode(node) {
    this.AllNodes.add(node);
  }

  async settleAllNodes() {
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

    //console.log(node.fieldAccessor)
    //node.mapOut(data, this, newNode);
    const dataObj = node.mapIn(data, this, newNode, newNode);

    //console.log('Graph creating node with', data)
    if (typeof newNode.setup === 'function')
      newNode.ready = newNode.setup();

    return newNode;
  }
});
