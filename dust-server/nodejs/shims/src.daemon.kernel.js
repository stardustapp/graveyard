const {promisify} = require('util');
const asyncTimeout = promisify(setTimeout);

Kernel = class Kernel {
  constructor(argv) {
    this.systemEnv = new Environment();
    this.ready = this.init(argv);
  }

  async init(argv) {
    const engine = GraphEngine.get('graph-daemon/v1-beta1');
    this.daemonInstance = await engine.buildUsingVolatile({argv});
    return this;
  }

  // expected to return within 30 seconds
  async boot() {
    return this.daemonInstance.boot();
  }

  // should run for the lifetime of the runtime, returning will shut down
  run() {
    return this.daemonInstance.run();
  }

  unref() {
    return this.daemonInstance.unref();
  }
}
