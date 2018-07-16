class Workload {
  constructor(record, session) {
    this.record = record;
    this.session = session;
  }
}

class DaemonWorkload extends Workload {
  constructor(record, session) {
    super(record, session);
    console.warn('------- DAEMON UP');
    this.ready = this.init();
  }

  async init() {
    // TODO: draw the rest of the owl
  }

  async stop(reason) {
    // TODO: draw the rest of the owl
  }
}