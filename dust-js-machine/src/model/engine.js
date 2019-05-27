exports.GraphEngine = class GraphEngine {
  constructor(builder) {
    const {key} = builder;

    this.engineKey = key;
    this.names = builder.names;
    this.edges = builder.edges;

    this.topType = Array
      .from(this.edges)
      .find(x => x.constructor === TopRelationBuilder)
      .topType;

    //this.extensions = new Map;
    this.lifecycleMethods = new Map;
    this.nameBehaviors = new Map;
  }

  attachLifecycleMethod(name, method) {
    if (this.lifecycleMethods.has(name)) throw new Error(
      `TODO: adding another lifecycle method '${method}'`);
    this.lifecycleMethods.set(name, method);
  }

  attachBehavior(name, behavior) {
    if (this.nameBehaviors.has(name)) throw new Error(
      `TODO: adding another behavior for '${name}'`);
    this.nameBehaviors.set(name, behavior);
  }
}
