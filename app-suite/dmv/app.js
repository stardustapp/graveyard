const orbiter = new Orbiter();
const sourceOrbiter = new Orbiter('/n/aws-ns/native-drivers');
const kubeOrbiter = new Orbiter('/n/kube-apt');

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
      return kubeOrbiter
        .invoke("/run-pod/invoke", {
          name: Orbiter.String(`sd-builddriver-${this.name}`),
          image: Orbiter.String('stardustapp/utils:latest'),
          command: Orbiter.String(`stardust-build-driver http://star-router-http/~~ ${this.name}`),
          privileged: Orbiter.String('yes'),
        }, true)
        .then(out => {
          this.status = 'Build completed';
          if (out) {
            out.loadFile('').then(x => {
              app.output = x;
              this.parseOutput(x);

              if (this.exitCode === 0) {
                this.deploy(prom);
              }
            });
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
      return kubeOrbiter
        .invoke("/deploy-svc/invoke", {
          name: Orbiter.String(this.name),
          image: Orbiter.String(`stardriver-${this.name}:latest`),
        }, true).then(out => {
          this.status = 'Deployed successfully';
          if (out) {
            out.loadFile('').then(x => {
              this.uri = x;
              this.mount(prom);
            });
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
      return orbiter
        .invoke("/rom/drv/nsimport/invoke", {
          'endpoint-url': Orbiter.String(this.uri),
        }, `/n/${this.name}`).then(out => {
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
    sourceOrbiter.loadMetadata('/').then(entry => {
      this.names = entry.children
        .filter(x => x.type === 'Folder')
        .map(x => x.name);
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
