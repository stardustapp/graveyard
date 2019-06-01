exports.LoadApi = class LoadApi {
  constructor(key) {
    this.key = key;

    // these get filled in by the public functions
    this.modelFunc = null;
    this.lifecycle = new Array;
    this.behaviors = new Map;
  }

  // call these to bring code in

  attachModel(modelFunc) {
    this.modelFunc = modelFunc;
  }

  attachLifecycle(protoClass) {
    this.lifecycle = this._captureMethods(protoClass.prototype);
  }

  attachBehavior(protoClass) {
    if (this.behaviors.has(protoClass.name)) throw new Error(
      `Driver ${this.key} loaded duplicate behavior ${protoClass.name}`);
    this.behaviors.set(protoClass.name, this._captureMethods(protoClass.prototype));
  }

  // private functions for machine to take code out

  _captureMethods(prototype) { return Object
    .getOwnPropertyNames(prototype)
    .filter(x => x[0] !== 'constructor')
    .map(x => [x, prototype[x]])
  }

  _callLifecycle(name, ...args) {
    return this._getLifecycle(name).call(this, ...args);
  }

  _makeObjectFactory(name, callback=null) {
    return data => {
      const object = this._newNamedObject(name, data);
      callback && callback(object);
      return object;
    };
  }

  _getLifecycle(name) { return this.lifecycle
    .filter(x => x[0] === name)
    .map(x => x[1])[0];
  }

  _newNamedObject(name, data={}) {
    const behavior = this._getBehavior(name);
    const hasSetupMethod = behavior.some(x => x[0] === 'setup');

    // if no setup, attach data directly
    const object = (hasSetupMethod ? false : data) || Object.create(null);
    for (const [key, method] of behavior) {
      Object.defineProperty(object, key, {
        value: method,
        enumerable: false,
        configurable: false,
      });
    }

    if (hasSetupMethod)
      object.ready = object.setup.call(object, data);
    return object;
  }

  _getBehavior(name) {
    const behavior = this.behaviors.get(name);
    if (!behavior) {
      if (!name) throw new Error(`LoadApi can't get behavior for empty name`);
      console.log('WARN:', `LoadApi ${this.key} lacking behavior for ${name}`);
      return;
    }
    return behavior;
  }
}
