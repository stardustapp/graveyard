class KernelComponent extends PlatformApi {
  constructor(type, key, data) {
    super(`${type} ${key}`);
    this.type = type;
    this.key = key;
    this.data = data;
    this.status = data.Enabled === 'no' ? 'disabled' : 'inactive';

    if (!data.EngineKey) throw new Error(`EngineKey is required for ${type} '${key}'`);

    this.getter('/engine key', String, () => data.EngineKey);
    this.getter('/status', String, () => this.status);
  }

  async activate(graphStore, GitHash) {
    if (this.status !== 'inactive') throw new Error(
      `Cannot activate component '${this.key}' while it is '${this.status}'`)
    this.status = 'activating';
    try {

      //await GraphEngine.load(this.data.EngineKey);
      //this.graph = await engine.buildUsingVolatile(this.data.Config);
      const graph = await graphStore.findOrCreateGraph({
        fields: {
          [`${this.type}`]: this.key,
        },
        GitHash,
        EngineKey: this.data.EngineKey,
        Config: this.data.Config,
      });


      const subCtx = await graphStore.getContextForGraph(graph);
      this.liveGraph = await subCtx.getTopObject();
      //this.dustDomain.graphDaemon = this;
      //console.log('built', this.liveGraph);

      if (typeof this.liveGraph.activate === 'function')
        await this.liveGraph.activate(graphStore);

      this.status = 'active';
    } catch (err) {
      this.status = 'crashed';
      throw err;
    }
  }
}

class KernelConnection extends KernelComponent {
  constructor(key, data) {
    super('Connection', key, data);
  }
}

class KernelDaemon extends KernelComponent {
  constructor(key, data) {
    super('Daemon', key, data);
    this.function('/activate', {
      input: null,
      impl: this.activate,
    });
  }
}

class KernelService extends KernelComponent {
  constructor(key, data) {
    super('Service', key, data);
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
