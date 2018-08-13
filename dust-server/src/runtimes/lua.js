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

  '/src/skylink/core-ops.js',
  '/src/skylink/client.js',
  '/src/skylink/server.js',
  '/src/skylink/channel-client.js',
  '/src/skylink/channel-server.js',

  '/src/lib/caching.js',
  '/src/lib/tracing.js',
  '/src/lib/mkdirp.js',
  '/src/lib/path-fragment.js',

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

class Workload {
  constructor({basePath, spec, wid}) {
    this.basePath = basePath;
    this.spec = spec;
    this.wid = wid;

    this.env = new Environment();
    this.ready = this.init();
  }

  async init() {
    await this.env.bind('/session', runtime.deviceForKernelPath(this.basePath));
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

const runtime = new RuntimeSlaveWorker(api => {
  const workloads = new Map;

  api.set('start daemon', async input => {
    const workload = new Workload(input);
    workloads.set(input.wid, workload);
    await workload.ready;
    workload.start();
    return;
  });
  api.set('stop daemon', async input => {
    const workload = workloads.get(input.wid);
    if (!workload)
      throw new Error('BUG: stop requested for unregistered daemon.', input);
    workloads.delete(input.wid);
    await workload.stop(input.reason);
    return;
  });

  api.set('load function', async input => {
    const workload = new Workload(input);
    workloads.set(input.wid, workload);
    return;
  });
  api.set('run function', async input => {
    const workload = workloads.get(input.wid);
    if (!workload)
      throw new Error('BUG: run requested for unregistered function.', input);
    const handle = workload.start(input.input);
    return handle.completion;
  });
});
