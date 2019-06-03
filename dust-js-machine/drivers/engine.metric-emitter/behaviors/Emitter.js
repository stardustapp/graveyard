function listifyTags(obj={}) {
  return Object.keys(obj).map(key => `${key}:${obj[key]}`);
}

function appendPoint(map, metric, value, tags) {
  const tagList = listifyTags(tags).sort();
  const key = JSON.stringify([metric, tagList]);
  if (map.has(key)) {
    map.get(key).push(value);
  } else {
    const list = new PointArray(metric, tagList);
    map.set(key, list);
    list.push(value);
  }
}
/*
Sink: { anyOfKeyed: {
  Datadog: { fields: {
    ApiKey: String,
  }},
  PostProxy: { fields: {
    Endpoint: String,
  }},
}},
*/
CURRENT_LOADER.attachBehavior(class Emitter {
  setup() {
    console.log('setting up datadog client', this.HostName, this.Sink.currentKey);
    this.globalTags = listifyTags(this.Tags);

    this.apiRoot = 'https://api.datadoghq.com/api';
    this.flushPeriod = 10; // seconds
    this.gauges = new Map;
    this.rates = new Map;
    this.counts = new Map;

    this.flushTimer = setInterval(this.flushNow.bind(this),
      this.flushPeriod * 1000);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
      const process = require('process');
      process.on('beforeExit', () => {
        console.log('Flushing final datadog metrics...');
        this.flushNow({
          unlessEmpty: true,
        });
      });
    }
  }

  async doHTTP(apiPath, payload) {
    console.log('sending metrics http', apiPath, payload);
    return;
    const response = await fetch(`${this.apiRoot}${apiPath}?api_key=${this.apiKey}`, {
      method: 'POST',
      //mode: 'no-cors', // we won't get any info about how the request went
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    }).catch(err => {
      // TODO: cache and retry the request
      // don't we only get this in nodejs? because no-cors
      console.log('Datadog request failed:', err.message);
      return err;
    });
    console.log('resp', response)
  }

  gauge(metric, value, tags) {
    appendPoint(this.gauges, metric, value, tags)
  }
  rate(metric, value, tags) {
    appendPoint(this.rates, metric, value, tags)
  }
  count(metric, value, tags) {
    appendPoint(this.counts, metric, value, tags)
  }

  statusCheck(metric, status, message, tags) {
    return this.doHTTP('/v1/check_run', {
      check: metric,
      timestamp: Math.floor(+new Date() / 1000),
      message, status,
      host_name: this.HostName,
      tags: this.globalTags.concat(listifyTags(tags)),
    });
  }

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  flushNow({
    unlessEmpty = false,
  }={}) {
    // report metrics as the middle of the batch
    // TODO: why?
    // TODO: batching points into chunks of 20/40/60 seconds in production
    const batchDate = Math.floor(+new Date() / 1000) - Math.round(this.flushPeriod / 2);
    const series = [];

    for (const array of this.gauges.values()) {
      if (array.length < 1) continue;
      let mean = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      let max = array.sort((a, b) => b - a)[0];

      series.push({
        metric: array.metric,
        type: 'gauge',
        points: [[batchDate, mean]],
        host: this.HostName,
        tags: this.globalTags.concat(array.tagList),
      });
      series.push({
        metric: array.metric+'.max',
        type: 'gauge',
        points: [[batchDate, max]],
        host: this.HostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    for (const array of this.rates.values()) {
      let value = array[0] || 0;
      if (array.length > 1) {
        value = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      }

      series.push({
        metric: array.metric,
        type: 'rate',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.HostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    for (const array of this.counts.values()) {
      const value = array.reduce((acc, cur) => acc + cur, 0);
      series.push({
        metric: array.metric,
        type: 'count',
        interval: this.flushPeriod,
        points: [[batchDate, value]],
        host: this.HostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    if (series.length === 0 && unlessEmpty === true)
      return -1;

    // Actually transmit data to Datadog
    return Promise.all([
      (series.length === 0) ? Promise.resolve() : this.doHTTP('/v1/series', {series}),
      this.statusCheck('starbox.alive', 0, 'Datadog pump is running'),
    ]);
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
