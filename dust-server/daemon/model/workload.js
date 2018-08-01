class Workload {
  constructor(record, session, runtime) {
    this.record = record;
    this.session = session;
    this.runtime = runtime;
  }

  static from(record, session, runtime) {
    const {wid, spec} = record;
    switch (spec.type) {
      case 'daemon':
        return new DaemonWorkload(record, session, runtime).ready;
      default:
        console.warn('Listed unknown app workload type', spec.type);
        return {record};
    }
  }
}

class DaemonWorkload extends Workload {
  constructor(record, session, runtime) {
    super(record, session, runtime);
    console.warn('------- DAEMON UP:', record.spec.displayName);
    this.ready = this.init();
  }

  async init() {
    const {wid, wlKey, spec} = this.record;

    const fd = await this.runtime.bindFd(this.session.env);
    const response = await this.runtime
      .invokeApi('start workload', {
        wid, spec,
        basePath: fd+'/mnt',
      });
    console.log('worker started:', response);
    return this;
  }

  async stop(reason) {
    const {wid} = this.record;
    try {
      const response = await this.runtime
        .invokeApi('stop workload', {wid, reason});
      console.log('worker stopped:', response);
    } finally {
      this.runtime.terminate();
      console.log('worker terminated');
    }
  }
}
