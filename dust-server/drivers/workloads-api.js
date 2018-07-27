window.WorkloadsApiDriver = class WorkloadsApiDriver {
  constructor(session, input={}) {
    this.sessions = session;
    this.input = input;
    console.debug('------------ workloads api boot ------------');
  }
}
