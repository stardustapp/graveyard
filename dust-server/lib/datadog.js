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

class Datadog {
  constructor(apiKey, globalTags) {
    this.flushPeriod = 10; // seconds
    this.globalTags = listifyTags(globalTags);
    this.gauges = new Map;
    this.rates = new Map;
    this.counts = new Map;

    this.apiRoot = 'https://api.datadoghq.com/api';
    this.apiKey = apiKey;

    this.flushTimer = setInterval(this.flushNow.bind(this),
      this.flushPeriod * 1000);
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

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  async flushNow() {
    const batchDate = Math.floor(+new Date() / 1000) - this.flushPeriod;
    const series = [];

    for (const array of this.gauges.values()) {
      // most recent
      //const value = array[array.length-1] || 0;
      // average value
      let mean = array.length < 2 ? (array[0] || 0)
          : array.reduce((acc, cur) => acc + cur, 0) / array.length;
      let max = array.sort((a, b) => b - a)[0] || 0;

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
        tags: this.globalTags.concat(array.tagList),
      });
      array.length = 0;
    }

    if (series.length === 0)
      return;

    // Actually transmit data to Datadog
    await Promise.all([
      this.doHTTP('/v1/series', {series}),
      this.doHTTP('/v1/check_run', {
        check: 'starbox.alive',
        timestamp: batchDate,
        message: 'Datadog pump is running',
        status: 0,
        tags: this.globalTags,
      }),
    ]);
    console.log('Submitted', series.length, 'datas to Datadog');
  }
}

chrome.storage.local.get('boxId', ({boxId}) => {
  if (!boxId) {
    boxId = makeRandomNid();
    chrome.storage.local.set({boxId}, () => {
      console.log('Self-assigned box ID', boxId);
    });
  }
  console.log('Configured datadog for boxId', boxId);
  Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', {boxId, host: boxId});
});

// TODO: this is copied from idb-treestore.js
function makeRandomNid() {
  let nid = Math.random().toString(16).slice(2);

  // pad out nid if it ended in zeroes
  if (nid.length >= 13) return nid;
  return nid + new Array(14 - nid.length).join('0');
}
