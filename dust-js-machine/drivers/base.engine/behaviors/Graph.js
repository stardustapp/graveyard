CURRENT_LOADER.attachBehavior(class Graph {
  setup({Template}) {
    this.AllNodes = new Set;
    this.DirtyNodes = new Set;

    this.NodeBuilders = new Map;
    for (const [name, node] of Template.NodeMap) {
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

  createNode(node, data) {
    const newNode = this.NodeBuilders.get(node)();

    Object.defineProperty(newNode, 'markDirty', {
      value: () => {
        console.log('marking node dirty');
        this.AllNodes.add(newNode);
      },
    });

    //console.log(node.fieldAccessor)
    //node.mapOut(data, this, newNode);
    const dataObj = node.mapIn(data, this, newNode, newNode);

    console.log(data)
    if (typeof newNode.setup === 'function')
      newNode.ready = newNode.setup();

    return newNode;
  }
});
