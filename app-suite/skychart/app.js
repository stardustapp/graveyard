const skychart = new Skychart('wss://devmode.cloud/~~export/ws');
//const skychart = new Skychart('ws://localhost:9236/~~export/ws');

// seed the RNG lol.
new Array(new Date() % 100)
  .forEach(Math.random);

// from skylink to js
camel = (name) => name
  .replace(/-([a-z])/g,
           (x) => x[1].toUpperCase())

enumeratePath = (chartPath, baseUri, maxDepth) => {
  if (maxDepth === undefined) maxDepth = 1;
  console.log('listing under', baseUri, 'depth', maxDepth);
  var basePath = '';

  var linkMatch = baseUri.match(/^skylink:\/\/([a-z0-9\-]+)\.chart\.local(\/.*)?$/);
  if (linkMatch) {
    console.log('opening skychart', linkMatch[1], linkMatch[2]||'/');
    const chartName = linkMatch[1];

    const input = Skylink.String('chart-name', chartName);
    const dest1 = '/tmp/autocomplete-local-chartapi-' + chartName;
    const dest = '/tmp/autocomplete-local-chart-' + chartName;
    return skychart.invoke('/pub/open/invoke', input, dest1)
      .then(() => skychart.invoke(dest1 + '/browse/invoke', null, dest))
      .then(() => skychart.enumerate(dest + linkMatch[2], {
        maxDepth: maxDepth,
        includeRoot: false,
      }));
  } else {
    console.log(chartPath, baseUri);
  }

  return Promise.resolve([]);
}


Vue.component('edit-entry', {
  template: '#edit-entry',
  props: {
    path: String,
    chart: Object,
    entry: Object,
    entries: Array,
  },
  data() {
    return {
      entryName: this.entry.name,
      mountPath: this.entry.mountPath,
      deviceType: this.entry.deviceType,
      deviceUri: this.entry.deviceUri,

      deviceOpts: [],
      devicePrefix: '',
      mountOpts: [],
      mountOptVals: {},
      deviceSuffix: '',
    };
  },
  created() {
    var prefixEnt = {mountPath: ''};
    this.entries.forEach(entry => {
      if (this.deviceUri.startsWith(entry.mountPath)) {
        if (entry.mountPath.length > prefixEnt.mountPath.length) {
          prefixEnt = entry;
        }
      }
    });

    this.devicePrefix = prefixEnt.mountPath;
    this.deviceSuffix = this.deviceUri.slice(prefixEnt.mountPath.length);

    this.reloadOpts();
  },
  methods: {

    reloadOpts() {
      this.deviceOpts = [];

      var prefixEnt = this.entries.find(x => x.mountPath === this.devicePrefix);
      if (prefixEnt) {
        enumeratePath(this.path, prefixEnt.deviceUri)
          .then(x => x.map(y => {
            y.Path = '/' + y.Name;
            if (y.Type === 'Folder') {
              y.Path += '/open'; // TODO!
            }
            return y;
          }))
          .then(x => this.deviceOpts = x)
          .then(() => this.reloadMntOpts());
      }
    },

    reloadMntOpts() {
      this.mountOpts = [];
      if (this.deviceType != 'ActiveMount' && this.deviceType != 'PassiveMount') return;
      var prefixEnt = this.entries.find(x => x.mountPath === this.devicePrefix);
      if (prefixEnt) {
        const deviceUri = prefixEnt.deviceUri + this.deviceSuffix;
        enumeratePath(this.path, deviceUri + '/input-shape', 4)
          .then(list => {
            var inputType = '';
            const propMap = new Map();
            list.forEach(entry => {
              const parts = entry.Name.split('/');
              if (entry.Name == 'type') {
                inputType = entry.StringValue;
              } else if (parts[0] === 'props' && parts.length === 2) {
                propMap.set(parts[1], {
                  name: parts[1],
                  path: '/' + parts[1],
                });
                if (entry.Type === 'String') {
                  // prop shorthand
                  propMap.get(parts[1]).type = entry.StringValue;
                }
              } else if (parts[0] === 'props' && parts[2] === 'type' && parts.length === 3) {
                propMap.get(parts[1]).type = entry.StringValue;
              } else if (parts[0] === 'props' && parts[2] === 'optional' && parts.length === 3) {
                propMap.get(parts[1]).optional = entry.StringValue === 'yes';
              }
            });

            if (inputType === 'String') {
              if (this.entryName) {
                skychart.loadString(this.path + '/entries/' + this.entryName + '/device-input')
                .then(x => this.mountOptVals.__ = x);
              }

              return [{
                name: 'Input',
                path: '__',
                type: 'String',
              }];
            } else if (inputType === 'Folder') {
              if (this.entryName) {
                skychart.enumerate(this.path + '/entries/' + this.entryName + '/device-input')
                .then(x => {
                  var vals = {};
                  x.forEach(y => {
                    if (y.Name) {
                      vals['/'+y.Name] = y.StringValue || '';
                    }
                  });
                  this.mountOptVals = vals;
                });
              }

              var list = [];
              propMap.forEach(prop => list.push(prop));
              return list;
            }
            return [];
          })
          .then(x => this.mountOpts = x)
      }
    },

    save() {
      const name = this.entryName || parseInt(Math.random().toString().slice(2)).toString(36);
      const deviceUri = this.devicePrefix + this.deviceSuffix;

      var deviceInput;
      if (this.mountOpts.length) {
        if (this.mountOpts[0].path === '__') {
          deviceInput = this.mountOptVals.__;
        } else {
          deviceInput = {};
          this.mountOpts.forEach(opt => {
            deviceInput[opt.name] = this.mountOptVals[opt.path];
          });
        }
      }

      return this.chart
        .storeEntry(name, this.mountPath, this.deviceType, deviceUri, deviceInput)
        .then(x => {
          console.log('save entry response:', x);
          this.$emit('saved');
        });
    },
    cancel() {
      this.$emit('saved');
    },

  },
});


Vue.component('manage-chart', {
  template: '#manage-chart',
  props: {
    chart: Object,
  },
  data() {
    return {
      entries: [],
      editing: null,
      vis: '',
    };
  },
  computed: {
  },
  created() {
    this.loadEntries();
  },
  methods: {

    loadEntries() {
      this.chart.loadEntries()
        .then(chart => this.entries = chart.entries);
    },

    startEdit(entry) {
      if (this.editing) {
        // TODO: only if dirty
        alert(`Finish your current edit before starting a new one`);
      } else {
        this.editing = entry;
      }
    },

    delEntry(entry) {
      if (entry.name) {
        if (!confirm(`Confirm deletion of mountpoint ${entry.mountpoint}`)) {
          return
        }
        return skychart.unlink(this.path + '/entries/' + entry.name).then(x => {
          alert('Successfully deleted entry');
          this.loadEntries();
        });
      }
    },

    finishEdit() {
      this.editing = null;
      this.loadEntries();
    },

    compile() {
      this.chart.visualize()
        .then(x => this.vis = btoa(x));
    },

  },
});

Vue.component('chart-card', {
  template: '#chart-card',
  props: {
    chart: Object,
    name: String,
    ownerName: String,
    ownerEmail: String,
    createdDate: Date,
    homeDomain: String,
  },
  computed: {
    createdDateStr() {
      return this.createdDate.toDateString();
    },
    launchUrl() {
      return `https://${this.homeDomain}/~${this.name}/`;
    },
    browseUrl() {
      return `https://${this.homeDomain}/~system/editor/?chart=${this.name}`;
    },
  },
  methods: {
    manage() {
      this.chart.manage()
        .then(c => {
          app.chart = c;
          app.mode = 'manage';
        }, err => {
          alert(`Failed to manage chart ${this.name}.\n\n${err}`);
          return Promise.reject(err);
        });
    },
  },
});

Vue.component('locate-chart', {
  template: '#locate-chart',
  data() {
    return {
      chartName: '',
      charts: [],
    };
  },
  created() {
    this.chartName = 'system';
    this.openChart();
    this.chartName = 'dan';
    this.openChart();
    this.chartName = 'dan-chat';
    this.openChart();
  },
  methods: {

    openChart() {
      const chartName = this.chartName;
      this.chartName = '';

      return skychart
        .openChart(chartName)
        .then(x => x.loadMetadata())
        .then(chart => {
          this.charts.push(chart);
        }, err => {
          this.chartName = chartName;
          alert(`Failed to open chart ${this.chartName}.\n\n${err}`);
          return Promise.reject(err);
        });
    },

    createChart() {
      const chartName = this.chartName;
      const ownerName = prompt('New owner name (your name), for public record');
      const ownerEmail = prompt('New owner email (your email), for public record');
      if (!chartName || !ownerName || !ownerEmail) {
        alert('Fill in everything and try creating a chart again');
        return
      }

      this.chartName = '';

      return skychart
        .createChart(chartName, ownerName, ownerEmail)
        .then(x => x.loadMetadata())
        .then(chart => {
          this.charts.push(chart);
        }, err => {
          this.chartName = chartName;
          alert(`Failed to create chart ${this.chartName}.\n\n${err}`);
          return Promise.reject(err);
        });
    },

  },
});

var app = new Vue({
  el: '#app',
  data: {
    chart: null,
    mode: 'locate',
  },
  methods: {
  },
  created() {
  }
});
