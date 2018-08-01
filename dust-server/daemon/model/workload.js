class Workload extends PlatformApi  {
  constructor(record, session, runtime) {
    super(`workload ${record.wid} ${record.wlKey} ${record.appKey}`);

    this.record = record;
    this.session = session;
    this.runtime = runtime;

    const {wid, wlKey, spec} = record;
    this.getter('/display name', String, () => spec.displayName);
    this.getter('/type', String, () => spec.type);
    this.getter('/config/runtime type', String, () => spec.runtime);
    this.getter('/config/source uri', String, () => spec.sourceUri);

    switch (spec.type) {
      case 'daemon':
        console.info('workload api daemon', )
        this.getter('/has worker', Boolean, () => !!this.runtime);
        this.getter('/session uri', String, () => this.session.uri);
        this.function('/restart', {
          async impl() {
            console.log('restarting', this, 'on user request');
            await this.stop('restart');
            await this.init();
          }
        });
        break;

      case 'function':
        break;
    }

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
        console.log('daemon stopped:', response);

      default:
        console.warn('"Stopped" unknown app workload type', spec.type);
    }
  }
}
