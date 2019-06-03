/*
  MetricKind: { type: String, allowedValues: ['gauge', 'rate', 'counter'] },
  MetricName: String,
  TagList: { type: String, isList: true },
*/

CURRENT_LOADER.attachBehavior(class Metric {
  setup() {
    console.log('setting up metric', this);
    this.pendingPoints = new Array;
  }
  pushPoint(value) {
    this.pendingPoints.push(value);
  }

  flush(batchDate) {
    const series = [];
    const array = this.pendingPoints;
    switch (this.MetricKind) {

    case 'gauge':
      if (array.length < 1) continue;
      let mean = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      let max = array.sort((a, b) => b - a)[0];

      series.push({
        metric: array.metric,
        type: 'gauge',
        points: [[batchDate, mean]],
        tags: this.globalTags.concat(array.tagList),
      });
      series.push({
        metric: array.metric+'.max',
        type: 'gauge',
        points: [[batchDate, max]],
        tags: this.globalTags.concat(array.tagList),
      });
      break;

    case 'rate':
      let value = array[0] || 0;
      if (array.length > 1) {
        value = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      }

      series.push({
        metric: array.metric,
        type: 'rate',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      break;

    case 'count':
      const value = array.reduce((acc, cur) => acc + cur, 0);
      series.push({
        metric: array.metric,
        type: 'count',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      break;

    default:
      throw new Error(`Unknown MetricKind ${this.MetricKind}`);
    }

    array.length = 0;
    return series;
  }
});

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
