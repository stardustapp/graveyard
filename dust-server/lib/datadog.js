class Datadog {
  constructor(apiKey, globalTags={}) {
    this.flushPeriod = 10; // seconds
    this.globalTags = this.listifyTags(globalTags);
    this.gauges = new Array;
    this.rates = new Array;
    this.counts = new Array;
    this.submissionUri = 'https://api.datadoghq.com/api/v1/series?api_key='+apiKey;

    this.flushTimer = setInterval(this.flushNow.bind(this),
      this.flushPeriod * 1000);
  }

  gauge(metric, value, tags={}) {
    this.gauges.push({metric, value, tags});
  }
  rate(metric, value, tags={}) {
    this.rates.push({metric, value, tags});
  }
  count(metric, value, tags={}) {
    this.counts.push({metric, value, tags});
  }

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  listifyTags(obj={}) {
    return Object.keys(obj).map(key => `${key}:${obj[key]}`);
  }

  async flushNow() {
    const batchDate = Math.floor(+new Date() / 1000) - this.flushPeriod;
    const series = [];

    for (const {metric, value, tags} of this.gauges) {
      series.push({
        metric: metric,
        type: 'gauge',
        points: [[batchDate, value]],
        tags: this.globalTags.concat(this.listifyTags(tags)),
      });
    }
    this.gauges.length = 0;

    for (const {metric, value, tags} of this.rates) {
      series.push({
        metric: metric,
        type: 'rate',
        //interval: 10,
        points: [[batchDate, value]],
        tags: this.globalTags.concat(this.listifyTags(tags)),
      });
    }
    this.rates.length = 0;

    for (const {metric, value, tags} of this.counts) {
      series.push({
        metric: metric,
        type: 'count',
        //interval: 10,
        points: [[batchDate, value]],
        tags: this.globalTags.concat(this.listifyTags(tags)),
      });
    }
    this.counts.length = 0;

    if (series.length === 0)
      return;

    const resp = await fetch(this.submissionUri, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({series}),
    });
    console.log('Submitted', series.length, 'datas to Datadog, got', resp);
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
  Datadog.Instance = new Datadog('e59ac011e926a7eaf6ff485f0a5d2660', {boxId});
});

// TODO: this is copied from idb-treestore.js
function makeRandomNid() {
  let nid = Math.random().toString(16).slice(2);

  // pad out nid if it ended in zeroes
  if (nid.length >= 13) return nid;
  return nid + new Array(14 - nid.length).join('0');
}
