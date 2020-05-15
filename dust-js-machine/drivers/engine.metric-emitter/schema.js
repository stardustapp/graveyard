CURRENT_LOADER.attachModel(async build => {
  await build.withFieldTypes('structural');

  build.node('Emitter', {
    relations: [
      { kind: 'top' },
      { predicate: 'EMITS', object: 'Metric' },
    ],
    fields: {
      HostName: { type: String, defaultValue: identifyHost() },
      MetricPrefix: String,
      GlobalTags: { type: String, isList: true },
      FlushPeriodSecs: { type: Number, defaultValue: 10 },
      Sink: { anyOfKeyed: {
        DatadogApi: { fields: {
          BaseUrl: { type: String, defaultValue: 'https://api.datadoghq.com/api' },
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

/*
if (typeof chrome === 'object' && chrome.storage) {
  // we're probs in a chrome app or extension
  chrome.storage.local.get('boxId', ({boxId}) => {
    if (!boxId) {
      boxId = makeRandomNid();
      chrome.storage.local.set({boxId}, () => {
        console.log('Self-assigned box ID', boxId);
      });
    }
    console.log('Configured datadog for boxId', boxId);
    const host = 'starbox-'+boxId;
    Datadog.Instance = new Datadog('REDACTED', host, {});
  });
} else if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  // we're in a web worker
  if (location.pathname.startsWith('/src/runtimes/')) {
    const runtime = location.pathname.split('/')[3].split('.').slice(0, -1).join('.');
    Datadog.Instance = new Datadog('REDACTED', 'runtime-'+runtime, {runtime});
  } else {
    Datadog.Instance = new Datadog('REDACTED', 'webworker', {});
  }
}
*/
