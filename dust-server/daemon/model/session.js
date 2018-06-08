class Session {
  constructor(record, account) {
    this.record = record;
    this.account = account;

    console.log('launching session for', account.address());
    this.env = new Environment();
    this.env.bind('/mnt', account.env);
    this.env.mount('/chart-name', 'literal', { string: account.address() });

    this.uri = 'skylink+ws://localhost:9237/pub/sessions/'+record.sid;
  }
};
