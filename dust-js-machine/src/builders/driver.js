exports.DriverBuilder = class DriverBuilder {
  constructor(key) {
    this.key = key;
    [this.type, this.name] = key.split('.');

    this.modelFunc = null;
    this.lifecycle = new Array;
    this.behaviors = new Map;
  }

  attachModel(modelFunc) {
    this.modelFunc = modelFunc;
  }
  attachLifecycle(protoClass) {
    this.lifecycle = this._captureMethods(protoClass.prototype);
  }
  attachBehavior(protoClass) {
    if (this.behaviors.has(protoClass.name)) throw new Error(
      `Driver ${this.name} loaded duplicate behavior ${protoClass.name}`);
    this.behaviors.set(protoClass.name, this._captureMethods(protoClass.prototype));
  }

  _captureMethods(prototype) { return Object
    .getOwnPropertyNames(prototype)
    .filter(x => x !== 'constructor')
    .map(x => [x, prototype[x]])
  }

  async compile() {
    //console.log('before', this);
    switch (this.type) {

      case 'engine':
        const builder = new GraphEngineBuilder(this.name, this.modelFunc);
        const engine = await builder.build();
        for (const [key, method] of this.lifecycle) {
          engine.attachLifecycleMethod(key, method);
        }

        for (const [name, methods] of this.behaviors) {
          const behavior = {};
          for (const [key, method] of methods)  {
            behavior[key] = method;
          }
          engine.attachBehavior(name, behavior);
        }
        console.log('compiled dust driver', this.key);
        //console.log('after', engine)
        return engine;

      default: throw new Error(
        `Don't know how to compile '${this.type}' driver`);
    }
  }
}
