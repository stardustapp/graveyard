CURRENT_LOADER.attachModel(async build => {
  await build.withFieldTypes('structural');

  build.node('Emitter', {
    relations: [
      { kind: 'top' },
      { predicate: 'EMITS', object: 'Metric' },
    ],
    fields: {
      HostName: { type: String, defaultValue: identifyHost() },
      GlobalTags: { type: String, isList: true },
      MetricPrefix: String,
      Sink: { anyOfKeyed: {
        Datadog: { fields: {
          ApiKey: String,
        }},
        PostProxy: { fields: {
          Endpoint: String,
        }},
      }},
    },
  });

  build.node('Metric', {
    relations: [
      { subject: 'Emitter', predicate: 'EMITS' },
    ],
    fields: {
      MetricKind: { type: String, allowedValues: ['gauge', 'rate', 'counter'] },
      MetricName: String,
      TagList: { type: String, isList: true },
      //PendingPoints: { type: Number, isList: true },
    },
  });
});

function identifyHost() {
  if (typeof require === 'function') {
    const process = require('process');
    const envValue = process.env['METRICS_HOSTNAME'];
    if (envValue) return envValue;

    const os = require('os');
    if (os.hostname() !== 'localhost')
      return `nodejs-${os.hostname()}`;
    const ifaces = os.networkInterfaces();
    const iface = Object.keys(ifaces)
      .filter(x => !ifaces[x].some(y => y.internal))
      .map(x => ifaces[x][0].address)[0]; // TODO: maybe mac?
    return `nodejs-${iface || 'noip'}-${os.userInfo().username}`;
  } else {
    // TODO: make stable IDs for other environments, eg localstorage
    return `adhoc-${makeRandomNid()}`;
  }
}
