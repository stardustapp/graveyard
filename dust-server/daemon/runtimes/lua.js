this.window = this;
importScripts(
  '/core/api-entries.js',
  '/core/environment.js',
  '/core/utils.js',
);
importScripts(
  '/core/nsexport.js',
  '/core/platform-api.js',

  '/lib/runtime-slave-worker.js',

  '/vendor/fengari.js',
  '/vendor/moment.js',
  //'/vendor/bugsnag.js',
);
delete this.window;

const luaconf  = fengari.luaconf;
const lua      = fengari.lua;
const lauxlib  = fengari.lauxlib;
const lualib   = fengari.lualib;

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
    const sourceEntry = await this.env.getEntry('/session/source/'+this.spec.sourceUri);
    const source = await sourceEntry.get();

    const machine = new LuaMachine(runtime.deviceForKernelPath(this.basePath));
    const output = machine.eval(atob(source.Data));

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

class LuaMachine {
  constructor() {
    this.L = lauxlib.luaL_newstate();
    //lualib.luaL_openlibs(this.L);
  }

  eval(source) {
    const {L} = this;

    // this returns an error or a result
    const compileRes = lauxlib.luaL_loadstring(L, fengari.to_luastring(source));
    if (compileRes !== lua.LUA_OK) {
      const error = lua.lua_tostring(L, -1);
      throw new Error('Lua compile fault. ' + fengari.to_jsstring(error));
    }

    // this throws on error
    lua.lua_pushliteral(L, "hello world!");
    lua.lua_call(L, 1, -1);
    const output = lua.lua_tostring(L, -1);
    return fengari.to_jsstring(output);
  }
}

console.log('hmm:', new LuaMachine().eval('return "this is a test"'));