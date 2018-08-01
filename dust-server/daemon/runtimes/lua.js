this.window = this;
importScripts(
  '/core/api-entries.js',
  '/core/environment.js',
  '/core/enumeration.js',
  '/core/utils.js',

  '/drivers/tmp.js',
  '/drivers/network-import.js',

  '/lib/tracing.js',
  '/lib/mkdirp.js',
  '/lib/path-fragment.js',

  '/vendor/fengari.js',
  '/vendor/moment.js',
  //'/vendor/bugsnag.js',
);
importScripts(
  '/core/nsexport.js',
  '/core/platform-api.js',

  '/lib/runtime-slave-worker.js',
  '/lib/lua-machine.js',
  '/lib/lua-api.js',
);
delete this.window;

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
    await this.env.mount('/session/state', 'tmp');
    const sourceEntry = await this.env.getEntry('/session/source/'+this.spec.sourceUri);
    const source = await sourceEntry.get();

    this.machine = new LuaMachine(this.env.pathTo('/session'));
    this.thread = this.machine.startThread(atob(source.Data));
    return this;
  }

  start(input) {
    console.warn('starting workload with', input);
    const completion = this.thread.run();
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
