class Session {

  constructor(systemEnv, profile) {
    this.systemEnv = systemEnv;
    this.env = new Environment();

    const {chartName} = profile;
    console.log('launching session for', chartName);

    this.env.mount('/mnt', 'bind', { source: profile.env });
    this.env.mount('/chart-name', 'literal', { string: chartName });
  }
};
