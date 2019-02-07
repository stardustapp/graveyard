const skychart = new Skychart2('wss://devmode.cloud/~~export/ws');
//const skychart = new Skychart('ws://localhost:9236/~~export/ws');

// seed the RNG lol.
new Array(new Date() % 100)
  .forEach(Math.random);

// from skylink to js
camel = (name) => name
  .replace(/-([a-z])/g,
           (x) => x[1].toUpperCase())

var skylinks = {};
enumeratePath = (chart, baseUri, maxDepth) => {
  if (maxDepth === undefined) maxDepth = 1;
  console.log('listing under', baseUri, 'depth', maxDepth);
  var basePath = '';

  var linkMatch = baseUri.match(/^skylink(?:\+(wss?|https?))?:\/\/([a-z0-9\-:.]+)(\/.*)?$/);
  if (linkMatch) {

    var subProto = linkMatch[1];
    if (subProto) {
      // TODO: dial and fetch
      var origin = subProto + '://' + linkMatch[2] + '/~~export';
      if (subProto.startsWith('ws')) {
        origin += '/ws';
      }

      console.log('Fetching', origin, 'skylink path', linkMatch[3]||'/');
      skylinks[origin] = skylinks[origin] || new Skylink('', origin);
      return skylinks[origin].enumerate(linkMatch[3]||'/', {
        maxDepth: maxDepth,
        includeRoot: false,
      })
    }

    var chartMatch = linkMatch[2].match(/^([a-z0-9\-]+)\.chart\.local$/);
    if (chartMatch) {

      console.log('opening skychart', chartMatch[1], linkMatch[3]||'/');
      const chartName = chartMatch[1];

      const input = Skylink.String('chart-name', chartName);
      const dest1 = '/tmp/autocomplete-local-chartapi-' + chartName;
      const dest = '/tmp/autocomplete-local-chart-' + chartName;
      return skychart.skylink.invoke('/pub/open/invoke', input, dest1)
        .then(() => skychart.skylink.invoke(dest1 + '/browse/invoke', null, dest))
        .then(() => skychart.skylink.enumerate(dest + (linkMatch[3] || ''), {
          maxDepth: maxDepth,
          includeRoot: false,
        }));

    }

  } else if (baseUri[0] === '/') {
    const upstream = chart.findClosestMount(baseUri);
    if (upstream.deviceType === 'BindLink') {
      const newPath = upstream.deviceUri + baseUri.slice(upstream.mountPath.length);
      return enumeratePath(chart, newPath, maxDepth);
    } else if (upstream.deviceType.endsWith('Mount')) {
      const newPath = upstream.deviceUri + '/output-shape/props' + baseUri.slice(upstream.mountPath.length);
      return enumeratePath(chart, newPath, maxDepth);
    }
  }

  return Promise.resolve([]);
}

Vue.component('edit-entry', {
  template: '#edit-entry',
  props: {
    chart: Object,
    entry: Object,
  },
  data() {
    return {
      entryName: this.entry.name,
      mountPath: this.entry.mountPath,
      deviceType: this.entry.deviceType,
      deviceUri: this.entry.deviceUri,

      parts: [],
      deviceUri: '',

      deviceSource: '',
      externalOrigin: '',
      inputShape: null,
      inputData: null,

      mountOpts: [],
      mountOptVals: {},
    };
  },

  created() {
    var selectedPath = '';
    const deviceUri = this.entry.deviceUri || '';

    var uriMatch = deviceUri.match(/^skylink(?:\+(wss?|https?))?:\/\/([a-z0-9\-:.]+)(\/.*)?$/);
    if (uriMatch) {
      this.deviceSource = 'External';
      this.externalOrigin = deviceUri.split('/', 3).join('/');
      selectedPath = (uriMatch[3] || '');

    } else if (deviceUri.startsWith('/') || deviceUri.length === 0) {
      this.deviceSource = 'Internal';
      selectedPath = deviceUri;

    } else {
      throw new Error(`Device URI ${deviceUri} can't be mapped`);
    }

    this.loadSource();
    if (selectedPath.length) {
      selectedPath.slice(1).split('/').forEach(name => {
        this.selectNextName(name);
      });
    }

    console.log('Restored device path', selectedPath);
    this.deviceUri = selectedPath;
  },

  methods: {

    // reset path with new origin
    loadSource() {
      this.parts.length = 0;
      var part = {
        parent: '',
        selected: '',
        loaded: '',
        choices: [],
      };

      if (this.deviceSource == 'External') {
        part.baseUri = this.externalOrigin;
        // TODO: inside BindLink, just hit the real thing
        // TODO: (if it's remote, else transform ent)
        enumeratePath(this.chart, this.externalOrigin, 1).then(list => {
          list.forEach(entry => {
            part.choices.push({
              name: entry.Name,
              type: entry.Type,
            });
          });
        }, err => {
          alert(`Error enumerating ${this.externalOrigin}:\n\n${err.message}`);
        });

      } else {
        // internal to the chart

        // locate a mount
        const choices = new Set();
        this.chart.entries.forEach(ent => {
          if (ent.mountPath === this.mountPath) return;
          var entParts = ent.mountPath.slice(1).split('/');
          var nextPart = entParts[this.parts.length];
          choices.add(nextPart);
        });
        choices.forEach(choice => {
          part.choices.push({name: choice});
        });

      }
      this.parts.push(part);
    },

    selectNextName(name) {
      var part = this.parts[this.parts.length - 1];
      part.selected = name;

      var newPart = {
        parent: part.parent + '/' + name,
        selected: '',
        loaded: '',
        freetext: true, // TODO: part.freetext,
        choices: [],
      };

      // figure out if we're remote
      var mount = this.chart.entries.find(ent => {
        return newPart.parent === ent.mountPath;
      });
      if (mount) {
        console.log('Setting baseUri to', mount.deviceUri, 'from', newPart.baseUri, 'at', newPart.parent);
        if (mount.deviceType.endsWith('Mount')) {
          newPart.baseUri = mount.deviceUri + '/output-shape/props';
        } else {
          newPart.baseUri = mount.deviceUri;
        }
      } else if (part.baseUri) {
        newPart.baseUri = part.baseUri + '/' + name;
      }

      if ((newPart.baseUri || '').includes('/output-shape')) {
        newPart.freetext = true;

      } else if (newPart.baseUri) {
        // TODO: if the bindlink is is local, just transform ent
        enumeratePath(this.chart, newPart.baseUri, 1).then(list => {
          var hasInvoke = list.find(x => x.Name === 'invoke' && x.Type === 'Function');
          if (hasInvoke) {
            console.log('Located device at', newPart.parent, 'under', newPart.baseUri, 'with', hasInvoke);
            this.loadDeviceInput(newPart.parent);

            var idx = this.parts.indexOf(newPart);
            if (idx >= 0) {
              this.parts.splice(idx, 100);
            }
          } else {
            console.log('enumerated', list.length, 'items at', newPart.baseUri);
            var found = false;
            list.forEach(entry => {
              if (entry.Name === newPart.selected) {
                found = true;
              }
              newPart.choices.push({
                name: entry.Name,
                type: entry.Type,
              });
            });
            if (newPart.selected && !found) {
              var idx = this.parts.indexOf(newPart);
              while (idx < this.parts.length) {
                this.parts[idx].freetext = true;
                idx++;
              }
            }
          }
        });

      } else {
        // locate a mount
        const choices = new Set();
        var mount;
        this.chart.entries.forEach(ent => {
          if (ent.mountPath === this.mountPath) return;
          if (ent.mountPath.length >= newPart.parent.length && ent.mountPath.startsWith(newPart.parent)) {
            var entParts = ent.mountPath.slice(1).split('/');
            var nextPart = entParts[this.parts.length];
            choices.add(nextPart);
          }
        });
        choices.forEach(choice => {
          newPart.choices.push({name: choice});
        });
      }

      part.loaded = name;
      console.log('Adding part', newPart);
      this.parts.push(newPart);
    },

    partChanged(part) {
      if (part.loaded === part.selected) return;
      console.log('part changed', JSON.stringify(part));

      var idx = this.parts.indexOf(part);
      if (idx >= 0) {
        this.parts.splice(idx+1, 100);
      }
      if (part.selected) {
        this.selectNextName(part.selected);
      }

      for (var i = this.parts.length - 1; i > 0; i--) {
        var part = this.parts[i];
        if (part.selected) {
          this.deviceUri = part.parent + '/' + part.selected;
          console.log('Set deviceUri to', this.deviceUri);
          return;
        }
      }
    },

    loadDeviceInput(uri) {
      this.mountOpts = [];
      enumeratePath(this.chart, uri + '/input-shape', 4).then(list => {
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
            skychart.skylink.loadString(this.chart.path + '/entries/' + this.entryName + '/device-input')
              .then(x => this.mountOptVals = {__: x});
          }

          return [{
            name: 'Input',
            path: '__',
            type: 'String',
          }];
        } else if (inputType === 'Folder') {
          if (this.entryName) {
            skychart.skylink.enumerate(this.chart.path + '/entries/' + this.entryName + '/device-input')
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
      }).then(x => this.mountOpts = x)
    },


    save() {
      var deviceUri = this.deviceUri;
      if (this.deviceSource === 'External') {
        deviceUri = this.externalOrigin + deviceUri;
      }

      const name = this.entryName || parseInt(Math.random().toString().slice(2)).toString(36);

      var deviceInput;
      if (this.mountOpts.length) {
        if (this.mountOpts[0].path === '__') {
          deviceInput = this.mountOptVals.__;
        } else {
          deviceInput = {};
          this.mountOpts.forEach(opt => {
            if (opt.type === 'Folder') {
              // store a symbolic link to where the Folder comes from
              deviceInput[opt.name] = Skylink.Link(opt.name, this.mountOptVals[opt.path]);
            } else {
              deviceInput[opt.name] = this.mountOptVals[opt.path];
            }
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


const ManageChart = Vue.component('manage-chart', {
  template: '#manage-chart',
  props: {
  },
  data() {
    return {
      chart: {},
      entries: [],
      editing: null,
      vis: '',
    };
  },
  computed: {
  },
  beforeRouteEnter(to, from, next) {
    const chartName = to.params.chartName;
    var chart = locatedCharts
      .find(x => x.name === chartName);

    var chartPromise;
    if (chart) {
      chartPromise = Promise.resolve(chart);
    } else {
      // open the chart if needed (support deeplinks)
      chartPromise = skychart
        .openChart(chartName)
        .then(x => x.loadMetadata());
    }

    chartPromise
      .then(c => c.manage())
      .then(c => next(vm => {
        vm.chart = c;
        vm.loadEntries();
      }), err => {
        alert(`Failed to manage chart ${chartName}.\n\n${err}`);
        return Promise.reject(err);
      });
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
        if (!confirm(`Confirm deletion of mountpoint ${entry.mountPoint}`)) {
          return
        }
        return skychart.skylink.unlink(this.chart.path + '/entries/' + entry.name).then(x => {
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
    manageTarget() {
      return {
        name: 'manage',
        params: {
          chartName: this.name,
        },
      };
    },
    launchUrl() {
      return `https://${this.homeDomain}/~${this.name}/`;
    },
    browseUrl() {
      return `https://${this.homeDomain}/~system/editor/?chart=${this.name}`;
    },
  },
  methods: {
  },
});

const locatedCharts = [];
const LocateChart = Vue.component('locate-chart', {
  template: '#locate-chart',
  data() {
    return {
      chartName: '',
      charts: locatedCharts,
    };
  },
  created() {
    if (locatedCharts.length === 0) {
      this.chartName = 'system';
      this.openChart();
      this.chartName = 'public';
      this.openChart();
      this.chartName = 'legacy';
      this.openChart();
      this.chartName = 'skylink';
      this.openChart();
      this.chartName = 'dan';
      this.openChart();
    }
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

// const Post = { template: '<div>post</div>' }

const router = new VueRouter({
  mode: 'hash',
  routes: [
    { path: '/', redirect: '/locate' },
    { path: '/locate', component: LocateChart },
    { name: 'manage', path: '/charts/:chartName/manage', component: ManageChart },
  ],
});

var app = new Vue({
  router,
  el: '#app',
  data: {
    chart: null,
  },
  methods: {
  },
  created() {
  }
});
