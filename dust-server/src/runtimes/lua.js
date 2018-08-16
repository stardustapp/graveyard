this.window = this;
importScripts(
  '/src/core/api-entries.js',
  '/src/core/environment.js',
  '/src/core/enumeration.js',
  '/src/core/utils.js',

  '/src/devices/tmp.js',
  '/src/devices/skylink-import.js',

  '/src/webapp/core/data/channel.js',
  '/src/webapp/core/data/subs/_base.js',
  '/src/webapp/core/data/subs/single.js',
  '/src/webapp/core/skylink/ns-convert.js',

  '/src/skylink/client.js',
  '/src/skylink/server.js',
  '/src/skylink/core-ops.js',
  '/src/skylink/ext-channel.js',
  '/src/skylink/ext-reversal.js',
  '/src/skylink/channel-client.js',
  '/src/skylink/channel-server.js',
  '/src/skylink/messageport.js',

  '/src/lib/caching.js',
  '/src/lib/tracing.js',
  '/src/lib/mkdirp.js',
  '/src/lib/path-fragment.js',
  '/src/lib/datadog.js',

  '/vendor/libraries/fengari.js',
  '/vendor/libraries/moment.js',
  //'/vendor/libraries/bugsnag.js',
);
importScripts(
  '/src/core/platform-api.js',

  '/src/lib/runtime-slave-worker.js',
  '/src/lib/lua-machine.js',
  '/src/lib/lua-api.js',
);
delete this.window;

const StateEnvs = new LoaderCache(id => {
  const env = new Environment();
  env.bind('', new TemporaryMount());
  return env;
});

const jsObj = Symbol.for('raw js object');

class Workload extends PlatformApi {
  constructor({basePath, spec, wid}) {
    super('workload '+wid);
    this.basePath = basePath;
    this.spec = spec;
    this.wid = wid;

    this.function('/start', {
      input: jsObj,
      impl: this.start,
    });

    this.ready = this.init();
  }

  async init() {
    await this.env.bind('/session', slave.deviceForKernelPath(this.basePath));
    await this.env.bind('/session/state', await StateEnvs.getOne('x', 'x'));
    const sourceEntry = await this.env.getEntry('/session/source/'+this.spec.sourceUri);

    this.machine = new LuaMachine(this.env.pathTo('/session'));
    this.thread = this.machine.startThread();

    if (sourceEntry.subscribe) {
      const rawSub = await sourceEntry.subscribe();
      await new Promise(resolve => {
        const sub = new SingleSubscription(rawSub);
        sub.forEach(literal => {
          const source = atob(literal.Data);
          this.thread.compile(source);

          resolve && resolve();
          resolve = null;
        });
      });

    } else {
      const literal = await sourceEntry.get();
      const source = atob(literal.Data);
      this.thread.compile(source);
    }
    return this;
  }

  start(input) {
    const completion = this.thread.run(input)
      .catch(err => {
        // restart the lua thread since it's probably crashed
        // TODO: cleanly stop old thread, or recover the lua thread
        console.warn('Recreating Lua workload because of crash');
        const oldThread = this.thread;
        this.thread = this.machine.startThread();
        this.thread.compile(oldThread.sourceText);
        return Promise.reject(err);
      });

    return {
      completion,
    };
  }

  async stop(evt) {
    console.warn('stopping workload', this);
    return this;
  }
}

class LuaRuntime extends PlatformApi {
  constructor() {
    super('lua runtime');

    this.workloads = new Map;

    this.function('/start daemon', {
      input: jsObj,
      impl: this.startDaemon,
    });
    this.function('/stop daemon', {
      input: jsObj,
      impl: this.stopDaemon,
    });

    this.function('/load function', {
      input: jsObj,
      impl: this.loadFunction,
    });
    this.function('/run function', {
      input: jsObj,
      output: jsObj,
      impl: this.runFunction,
    });
  }

  async startDaemon(input) {
    const workload = new Workload(input);
    this.env.bind(`/wid/${input.wid}`, workload);
    this.workloads.set(input.wid, workload);

    await workload.ready;
    workload.start();
  }
  async stopDaemon(input) {
    const workload = this.workloads.get(input.wid);
    if (!workload)
      throw new Error('BUG: stop requested for unregistered daemon.', input);
    this.workloads.delete(input.wid);
    await workload.stop(input.reason);
  }

  async loadFunction(input) {
    const workload = new Workload(input);
    this.env.bind(`/wid/${input.wid}`, workload);
    this.workloads.set(input.wid, workload);

    await workload.ready;
  }
  async runFunction(input) {
    const workload = this.workloads.get(input.wid);
    if (!workload)
      throw new Error('BUG: run requested for unregistered function.', input);
    const handle = workload.start(input.input);
    return handle.completion;
  }
}

const runtime = new LuaRuntime();
const slave = new RuntimeSlaveWorker(runtime.env);
