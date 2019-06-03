/*
  MetricKind: { type: String, allowedValues: ['gauge', 'rate', 'counter'] },
  MetricName: String,
  TagList: { type: String, isList: true },
*/

CURRENT_LOADER.attachBehavior(class Metric {
  setup() {
    console.log('setting up metric', this.exportData());
    this.tagList = this.exportData().TagList; // TODO: why?
    this.pendingPoints = new Array;
  }
  pushPoint(value) {
    this.pendingPoints.push(value);
  }

  flush(batchDate, unlessEmpty=false) {
    if (this.pendingPoints.length === 0 && unlessEmpty) return;

    const series = [];
    const array = this.pendingPoints;
    switch (this.MetricKind) {

    case 'gauge':
      if (array.length < 1) return [];
      let mean = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      let max = array.sort((a, b) => b - a)[0];

      series.push({
        metric: this.MetricName,
        type: 'gauge',
        points: [[batchDate, mean]],
        tags: this.tagList,
      });
      series.push({
        metric: this.MetricName+'.max',
        type: 'gauge',
        points: [[batchDate, max]],
        tags: this.tagList,
      });
      break;

    case 'rate':
      let meanValue = array[0] || 0;
      if (array.length > 1) {
        meanValue = array.reduce((acc, cur) => acc + cur, 0) / array.length;
      }

      series.push({
        metric: this.MetricName,
        type: 'rate',
        points: [[batchDate, meanValue]],
        tags: this.tagList,
      });
      break;

    case 'count':
      const sumValue = array.reduce((acc, cur) => acc + cur, 0);
      series.push({
        metric: this.MetricName,
        type: 'count',
        points: [[batchDate, sumValue]],
        tags: this.tagList,
      });
      break;

    default:
      throw new Error(`Unknown MetricKind ${this.MetricKind}`);
    }

    array.length = 0;
    return series;
  }
});
