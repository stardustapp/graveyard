class Graph {
  constructor(store, data) {
    this.store = store;
    this.data = data;
    this.engine = GraphEngine.get(data.engine);

    this.objects = new Map;
    this.roots = new Set;
  }

  populateObject(data) {
    if (this.objects.has(data.objectId)) throw new Error(
      `Graph ${this.data.graphId} already has object ${data.objectId}`);
    if (this.store.objects.has(data.objectId)) throw new Error(
      `Graph store already has object ${data.objectId}`);

    const obj = this.engine.spawnObject(data);
    this.objects.set(data.objectId, obj);
    this.store.objects.set(data.objectId, obj);
    if (obj.type.treeRole == 'root') {
      this.roots.add(obj);
    }
  }

  relink() {
    for (const root of this.roots) {
      //console.log('relinking', root);
      // TODO
    }
  }

  selectNamed(name) {
    return Array
      .from(this.objects.values())
      .find(x => x.data.name === name);
  }
  selectAllWithType(type) {
    return Array
      .from(this.objects.values())
      .filter(x => x.data.type === type);
  }
}
