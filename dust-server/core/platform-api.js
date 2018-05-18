class PlatformApi {
  constructor(name) {
    this.name = name;
    this.paths = new Map;
  }

  getter(path, type, impl) {
    this.paths.set(path, new PlatformApiGetter(this, type, impl));
    return this;
  }
  function(path, args) {
    this.paths.set(path, new PlatformApiFunction(this, args));
    return this;
  }

  async getEntry(path) {
    return this.paths.get(path);
  }
}

class PlatformApiGetter {
  constructor(self, type, impl) {
    this.self = self;
    this.type = type;
    this.impl = impl;
  }
  get() {
    return this.impl
        .call(this.self)
        .then(x => this.outputType.serialize(x));
  }
}

class PlatformApiFunction {
  constructor(self, {input, output, impl}) {
    this.self = self;
    this.inputType = PlatformApiType.of(input);
    this.outputType = PlatformApiType.of(output);
    this.impl = impl;
  }
  invoke(input) {
    return this.impl
        .call(this.self, this.inputType.deserialize(input))
        .then(x => this.outputType.serialize(x));
  }
}

class PlatformApiType {
  static of(source) {
    console.log('schema source:', source);
  }
}