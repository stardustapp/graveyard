function listifyTags(obj={}) {
  return Object.keys(obj).map(key => `${key}:${obj[key]}`);
}

CURRENT_LOADER.attachBehavior(class Emitter {
  setup() {
    //console.log('setting up datadog client', this.HostName, this.Sink.currentKey);
    this.metrics = new Map;

    this.flushTimer = setInterval(this.flushNow.bind(this),
      this.FlushPeriodSecs * 1000);
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
    //console.log('sending metrics http', apiPath, payload, this.Sink.currentKey);
    switch (this.Sink.currentKey) {

      case 'PostProxy':
        const {Endpoint} = this.Sink.PostProxy;
        const response = await fetch(Endpoint, {
          method: 'POST',
          body: JSON.stringify({
            path: apiPath,
            json: payload,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        });
        console.log('Metrics: POST', apiPath, '-->', response.status);
        if (response.status !== 202) throw new Error(
          `Metrics/Emitter PostProxy Sink got unexpected HTTP ${response.status}`);
        break;

      case 'DatadogApi':
        const {BaseUrl, ApiKey} = this.Sink.DatadogApi;
        await fetch(`${BaseUrl}${apiPath}?api_key=${ApiKey}`, {
          method: 'POST',
          mode: 'no-cors', // we won't get any info about how the request went
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
        break;

      default: throw new Error(
        `Unhandled Emitter Sink ${this.Sink.currentKey}`);
    }
  }

  gauge(metric, value, tags) {
    this.appendPoint('gauge', metric, value, tags)
  }
  rate(metric, value, tags) {
    this.appendPoint('rate', metric, value, tags)
  }
  count(metric, value, tags) {
    this.appendPoint('count', metric, value, tags)
  }

  statusCheck(metric, status, message, tags) {
    return this.doHTTP('/v1/check_run', {
      check: metric,
      timestamp: Math.floor(+new Date() / 1000),
      message, status,
      host_name: this.HostName,
      tags: this.GlobalTags.concat(listifyTags(tags)),
    });
  }

  stop() {
    if (!this.flushTimer) throw new Error(`Can't stop, already stopped.`);
    clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  appendPoint(kind, name, value, tags) {
    const tagList = listifyTags(tags).sort();
    const key = JSON.stringify([kind, name, tagList]);
    if (this.metrics.has(key)) {
      this.metrics.get(key).pushPoint(value);
    } else {
      const metric = this.EMITS.newMetric({
        MetricKind: kind,
        MetricName: name,
        TagList: tagList,
      });
      this.metrics.set(key, metric);
      metric.pushPoint(value);
    }
  }

  flushNow({
    unlessEmpty = false,
  }={}) {
    // report metrics as the middle of the batch
    // TODO: why?
    // TODO: batching points into chunks of 20/40/60 seconds in production
    const batchDate = Math.floor(+new Date() / 1000) - Math.round(this.FlushPeriodSecs / 2);
    const series = [];

    for (const metric of this.metrics.values()) {
      for (const item of metric.flush(batchDate, unlessEmpty)) {
        series.push({
          metric: this.MetricPrefix + item.metric,
          type: item.type,
          host: this.HostName,
          points: item.points,
          interval: this.FlushPeriodSecs,
          tags: this.GlobalTags.concat(item.tags),
        });
      }
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
