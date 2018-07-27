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

    const machine = new LuaMachine(this.env.pathTo('/session'));
    const thread = machine.startThread(atob(source.Data));
    const completion = thread.run();

    console.warn('starting workload', source);
    return false;
  }

  async stop(evt) {
    console.warn('stopping workload', this);
    return false;
  }
}

const runtime = new RuntimeSlaveWorker(api => {
  const workloads = new Map;

  api.set('start workload', async input => {
    const workload = new Workload(input);
    workloads.set(input.wid, workload);
    return workload.ready;
  });
  api.set('stop workload', async input => {
    const workload = workloads.get(input.wid);
    if (!workload)
      throw new Error('BUG: stop requested for unregistered workload.', input);
    workloads.delete(input.wid);
    return workload.stop(input);
  });
});
