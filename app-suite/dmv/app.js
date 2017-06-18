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
      console.log(3, this.exitCode);
    },

    compile() {
      this.status = 'Generating';
      kubeOrbiter
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

              if (x.exitCode === 0) {
                this.deploy();
              }
            });
          } else {
            this.output = null;
          }
        }, err => {
          this.status = 'Crashed';
        });
    },

    deploy() {
      this.status = 'Deploying';
      kubeOrbiter
        .invoke("/deploy-svc/invoke", {
          name: Orbiter.String(this.name),
          image: Orbiter.String(`stardriver-${this.name}:latest`),
        }, true).then(out => {
          this.status = 'Deployed successfully';
          if (out) {
            out.loadFile('').then(x => {
              this.uri = x;
              this.mount();
            });
          }
        }, err => {
          this.status = 'Deploying crashed';
        });
    },

    mount() {
      if (!this.uri) {
        return alert("No endpoint known for driver " + this.name);
      }

      this.status = 'Mounting';
      orbiter
        .invoke("/rom/drv/nsimport/invoke", {
          'endpoint-url': Orbiter.String(this.uri),
        }, `/n/${this.name}`).then(out => {
          this.status = 'Mounted successfully';
        }, err => {
          this.status = 'Mounting crashed';
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
});

var app = new Vue({
  el: '#app',
  data: {
    output: 'None',
  },
});
