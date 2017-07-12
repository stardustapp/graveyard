//const skychart = new Skylink('', 'wss://skychart.stardustapp.run/~~export/ws');
const skychart = new Skylink('', 'ws://localhost:9236/~~export/ws');

// seed the RNG lol.
new Array(new Date() % 100)
  .forEach(Math.random);

// from skylink to js
camel = (name) => name
  .replace(/-([a-z])/g,
           (x) => x[1].toUpperCase())

listDevices = (baseUri) => {
  console.log('listing under', baseUri);
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
      .then(() => skychart.enumerate(dest + linkMatch[2], {includeRoot: false}));
  }

  return Promise.resolve([]);
}


Vue.component('edit-entry', {
  template: '#edit-entry',
  props: {
    path: String,
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
        listDevices(prefixEnt.deviceUri)
          .then(x => x.map(y => {
            y.Path = '/' + y.Name;
            if (y.Type === 'Folder') {
              y.Path += '/open'; // TODO!
            }
            return y;
          }))
          .then(x => this.deviceOpts = x);
      }
    },

    save() {
      const name = this.entryName || parseInt(Math.random().toString().slice(2)).toString(36);
      const deviceUri = this.devicePrefix + this.deviceSuffix;

      return skychart.store(this.path + '/entries/' + name, Skylink.Folder(name, [
        Skylink.String('mount-path', this.mountPath),
        Skylink.String('device-type', this.deviceType),
        Skylink.String('device-uri', deviceUri),
      ])).then(x => {
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
    name: String,
    path: String,
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
      skychart.enumerate(this.path + '/entries', {
        maxDepth: 2,
        includeRoot: false,
      }).then(children => {
        const entries = new Map();

        children.forEach(child => {
          const parts = child.Name.split('/');
          if (parts.length === 1 && child.Type === 'Folder') {
            entries.set(parts[0], { name: parts[0] });
          } else if (parts.length === 2 && child.Type === 'String') {
            entries.get(parts[0])[camel(parts[1])] = child.StringValue;
          }
        });

        this.entries = [];
        entries.forEach(obj => this.entries.push(obj));
      });
    },

    startEdit(entry) {
      if (this.editing) {
        alert(`Finish your current edit before starting a new one`);
      } else {
        this.editing = entry;
      }
    },

    delEntry(entry) {
      if (entry.name) {
        if (!confirm(`Confirm deletion of mountpoing ${entry.mountpoint}`)) {
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
      const dest = '/tmp/compile-' + parseInt(Math.random().toString().slice(2)).toString(36);
      skychart
        .invoke(this.path + '/compile/invoke', null, dest)
        .then(() => skychart.loadFile(dest + '/visualization.html'))
        .then(x => this.vis = btoa(x));
    },

  },
});

Vue.component('chart-card', {
  template: '#chart-card',
  props: {
    name: String,
    path: String,
  },
  data() {
    return {
      ownerName: '',
      ownerEmail: '',
      createdDate: '',
      homeDomain: '',
    };
  },
  computed: {
  },
  created() {
    skychart.enumerate(this.path, {includeRoot: false}).then(children => {
      this.ownerName = '';
      this.ownerEmail = '';
      this.createdDate = null;
      this.homeDomain = null;

      children.forEach(child => {
        if (child.Name === 'owner-name') {
          this.ownerName = child.StringValue;
        } else if (child.Name === 'owner-email') {
          this.ownerEmail = child.StringValue;
        } else if (child.Name === 'created-date') {
          this.createdDate = new Date(child.StringValue).toDateString();
        } else if (child.Name === 'home-domain') {
          this.homeDomain = child.StringValue;
        }
      });
    }, err => {
      alert(`Chart ${this.name} couldn't be read.\n\n${err}`);
    });
  },
  methods: {
    selectMode(mode) {
      app.chart = {
        name: this.name,
        path: this.path,
      };
      const dest = '/tmp/' + mode + '-' + this.name;
      return skychart.invoke(this.path + '/' + mode + '/invoke', null, dest)
        .then(() => {
          app.openedPath = dest;
          app.mode = mode;
        }, err => {
          alert(`Failed to ${mode} chart ${this.name}.\n\n${err}`);
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
      const input = Skylink.String('chart-name', this.chartName);
      const dest = '/tmp/chart-' + this.chartName;
      const chartName = this.chartName;
      this.chartName = '';

      return skychart.invoke('/pub/open/invoke', input, dest)
        .then(() => {
          this.charts.push({
            name: chartName,
            path: dest,
          });
        }, err => {
          this.chartName = chartName;
          alert(`Failed to open chart ${this.chartName}.\n\n${err}`);
          return Promise.reject(err);
        });
    },

    createChart() {
      const ownerName = prompt('New owner name (your name), for public record');
      const ownerEmail = prompt('New owner email (your email), for public record');
      if (!this.chartName || !ownerName || !ownerEmail) {
        alert('Fill in everything and try creating a chart again');
        return
      }

      const input = Skylink.Folder('input', [
        Skylink.String('chart-name', this.chartName),
        Skylink.String('owner-name', ownerName),
        Skylink.String('owner-email', ownerEmail),
      ]);
      const dest = '/tmp/chart-' + this.chartName;
      const chartName = this.chartName;
      this.chartName = '';

      return skychart.invoke('/pub/create/invoke', input, dest)
        .then(() => {
          this.charts.push({
            name: chartName,
            path: dest,
          });
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
    openedPath: '',
  },
  methods: {

  },
  created() {
  }
});
