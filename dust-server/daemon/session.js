class Session {

  constructor(systemEnv, profile) {
    this.systemEnv = systemEnv;

    const {chartName} = profile;
    console.log('launching session for', chartName);

    this.env = new Environment();
    this.env.bind('/mnt', profile.env);
    this.env.mount('/chart-name', 'literal', { string: chartName });
  }
};
