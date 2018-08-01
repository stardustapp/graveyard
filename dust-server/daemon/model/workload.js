class Workload {
  constructor(record, session, runtime) {
    this.record = record;
    this.session = session;
    this.runtime = runtime;

    this.ready = this.init();
  }

  async init() {
    const {wid, wlKey, spec} = this.record;
    switch (spec.type) {

      case 'daemon':
        const fd = await this.runtime.bindFd(this.session.env);
        const response = await this.runtime
          .invokeApi('start workload', {
            wid, spec,
            basePath: fd+'/mnt',
          });
        console.log('daemon started:', response);

      default:
        console.warn('"Started" unknown app workload type', spec.type);
    }

    return this;
  }

  async stop(reason) {
    const {wid, spec} = this.record;
    switch (spec.type) {

      case 'daemon':
        const response = await this.runtime
          .invokeApi('stop workload', {wid, reason});
        console.log('worker stopped:', response);

      default:
        console.warn('"Stopped" unknown app workload type', spec.type);
    }
  }
}
