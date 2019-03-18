function listifyTags(obj={}) {
  return Object.keys(obj).map(key => `${key}:${obj[key]}`);
}

class PointArray extends Array {
  constructor(metric, tagList) {
    super();
    this.metric = metric;
    this.tagList = tagList;
  }
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

Datadog = class Datadog {
  constructor(apiKey, hostName, globalTags) {
    this.apiKey = apiKey;
    this.hostName = hostName;
    this.globalTags = listifyTags(globalTags);

    this.apiRoot = 'https://api.datadoghq.com/api';
    this.flushPeriod = 10; // seconds
    this.gauges = new Map;
    this.rates = new Map;
    this.counts = new Map;

    this.flushTimer = setInterval(this.flushNow.bind(this),
      this.flushPeriod * 1000);
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
      // TODO: trigger final flush at shutdown
    }
  }

  doHTTP(apiPath, payload) {
    return fetch(`${this.apiRoot}${apiPath}?api_key=${this.apiKey}`, {
      method: 'POST',
      mode: 'no-cors', // we won't get any info about how the request went
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });
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
      host_name: this.hostName,
      tags: this.globalTags.concat(listifyTags(tags)),
    });
  }

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  async flushNow() {
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
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      series.push({
        metric: array.metric+'.max',
        type: 'gauge',
        points: [[batchDate, max]],
        host: this.hostName,
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
        host: this.hostName,
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
        host: this.hostName,
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    if (series.length === 0)
      return;

    // Actually transmit data to Datadog
    await Promise.all([
      this.doHTTP('/v1/series', {series}),
      this.statusCheck('starbox.alive', 0, 'Datadog pump is running'),
    ]);
  }
}

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
    Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', host, {});
  });
} else if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  if (location.pathname.startsWith('/src/runtimes/')) {
    const runtime = location.pathname.split('/')[3].split('.').slice(0, -1).join('.');
    Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', 'runtime-'+runtime, {runtime});
  } else {
    Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', 'webworker', {});
  }
} else {
  Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', 'webbrowser', {});
}

// TODO: this is copied from idb-treestore.js
function makeRandomNid() {
  let nid = Math.random().toString(16).slice(2);

  // pad out nid if it ended in zeroes
  if (nid.length >= 13) return nid;
  return nid + new Array(14 - nid.length).join('0');
}
