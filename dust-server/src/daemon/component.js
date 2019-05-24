class KernelComponent extends PlatformApi {
  constructor(type, key, data) {
    super(`${type} ${key}`);
    this.type = type;
    this.key = key;
    this.data = data;
    this.status = 'inactive';

    if (!data.EngineKey) throw new Error(`EngineKey is required for ${type} '${key}'`);

    this.getter('/engine key', String, () => data.EngineKey);
    this.getter('/status', String, () => this.status);
  }
}

class KernelConnection extends KernelComponent {
  constructor(key, data) {
    super('connection', key, data);
  }
}

class KernelDaemon extends KernelComponent {
  constructor(key, data) {
    super('daemon', key, data);
    this.function('/activate', {
      input: null,
      impl: this.activate,
    });
  }

  async activate() {
    throw new Error(`Daemon activation still TODO`);
  }
}

class KernelService extends KernelComponent {
  constructor(key, data) {
    super('service', key, data);
    if (!data.Address) throw new Error(`Address is required for a Service`);
    this.getter('/address', String, () => data.Address);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    KernelComponent,
    KernelConnection,
    KernelDaemon,
    KernelService,
  };
}
