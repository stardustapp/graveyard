const skylink = new Skylink();
const sourceSkylink = new Skylink('/n/redis-ns/native-drivers');
const kubeSkylink = new Skylink('/n/kube-apt');

Vue.component('driver', {
  template: '#driver',
  props: {
    name: String,
  },
  data() {
    return {
      uri: '',
      status: 'idle',
    };
  },
  methods: {

    parseOutput(output) {
      this.exitCode = +output.match(/Pod terminated with code (\d+)/)[1]
    },

    compile(prom) {
      this.status = 'Generating';
      return kubeSkylink
        .invoke("/run-pod/invoke", Skylink.Folder('input', [
          Skylink.String('name', `sd-builddriver-${this.name}`),
          Skylink.String('image', 'stardustapp/utils:latest'),
          Skylink.String('command', `stardust-build-driver http://star-router-http/~~ ${this.name}`),
          Skylink.String('privileged', 'yes'),
        ]))
        .then(out => {
          this.status = 'Build completed';
          if (out && out.Type === 'String') {
            app.output = out.StringValue;
            this.parseOutput(out.StringValue);

            if (this.exitCode === 0) {
              this.deploy(prom);
            }
          } else {
            this.output = null;
          }
        }, err => {
          this.status = 'Crashed';
          prom && prom();
        });
    },

    deploy(prom) {
      this.status = 'Deploying';
      return kubeSkylink
        .invoke("/deploy-svc/invoke", Skylink.Folder('input', [
          Skylink.String('name', this.name),
          Skylink.String('image', `stardriver-${this.name}:latest`),
        ])).then(out => {
          this.status = 'Deployed successfully';
          if (out && out.Type === 'String') {
            // convert driver URL into websocket transport
            this.uri = out.StringValue.replace('http://', 'ws://') + '/ws';
            setTimeout(() => {
              this.mount(prom);
            }, 2500);
          }
        }, err => {
          this.status = 'Deploying crashed';
          prom && prom();
        });
    },

    mount(prom) {
      if (!this.uri) {
        return alert("No endpoint known for driver " + this.name);
      }

      this.status = 'Mounting';
      return skylink
        .invoke("/rom/drv/nsimport/invoke", Skylink.Folder('input', [
          Skylink.String('endpoint-url', this.uri),
        ]), `/n/${this.name}`).then(() => {
          this.status = 'Mounted successfully';
          prom && prom(true);
          window.parent.app.selectTreeNode('/n').reload();
        }, err => {
          this.status = 'Mounting crashed';
          prom && prom();
        });
    },

  },
});

Vue.component('driver-list', {
  template: '#driver-list',
  data() {
    return {
      names: [],
    };
  },
  created() {
    sourceSkylink.enumerate('', {
      includeRoot: false,
    }).then(list => {
      this.names = list
        .filter(x => x.Type === 'Folder')
        .map(x => x.Name);
    });
  },
  methods: {

    buildAll() {
      app.buildingAll = true;
      const toGo = Array.from(this.$refs.drivers);
      const doNext = (res) => {
        if (toGo.length === 0) {
          app.buildingAll = false;
        } else if (toGo.length === 1) {
          const driver = toGo.shift();
          driver.compile(doNext);
        } else {
          const driver = toGo.shift();
          driver.compile().then(doNext);
        }
      };
      doNext();
    },

  },
});

var app = new Vue({
  el: '#app',
  data: {
    output: 'None',
    buildingAll: false,
  },
  methods: {
    buildAll() {
      this.$refs.list.buildAll();
    },
  },
});
