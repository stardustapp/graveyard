const orbiter = new Orbiter();
const sourceOrbiter = new Orbiter('/n/aws-ns/native-drivers');
const kubeOrbiter = new Orbiter('/n/kube-apt');

var app = new Vue({
  el: '#app',
  data: {
    driverList: [],
    driverUris: {},
    status: 'Idle',
    output: 'None',
  },
  created() {
    sourceOrbiter.loadMetadata('/').then(entry => {
      this.driverList = entry.children
        .filter(x => x.type === 'Folder')
        .map(x => x.name);
    });
  },
  methods: {

    compile(driver) {
      this.status = 'Generating';
      kubeOrbiter
        .invoke("/run-pod/invoke", {
          name: Orbiter.String(`sd-builddriver-${driver}`),
          image: Orbiter.String('stardustapp/utils:latest'),
          command: Orbiter.String(`stardust-build-driver http://star-router-http/~~ ${driver}`),
          privileged: Orbiter.String('yes'),
        }, true)
        .then(out => {
          this.status = 'Build completed';
          if (out) {
            out.loadFile('').then(x => {
              this.output = x;

              if (x.includes('Pod terminated with code 0')) {
                this.deploy(driver);
              }
            });
          } else {
            this.output = null;
          }
        }, err => {
          this.status = 'Crashed';
        });
        //.then(x => console.log('invocation got', x));
    },

    deploy(driver) {
      this.status = 'Deploying';
      kubeOrbiter
        .invoke("/deploy-svc/invoke", {
          name: Orbiter.String(driver),
          image: Orbiter.String(`stardriver-${driver}:latest`),
        }, true).then(out => {
          this.status = 'Deployed successfully';
          if (out) {
            out.loadFile('').then(x => {
              this.driverUris[driver] = x;
              this.mount(driver);
            });
          }
        }, err => {
          this.status = 'Deploying crashed';
        });
    },

    mount(driver) {
      const endpointUri = this.driverUris[driver];
      if (!endpointUri) {
        return alert("No endpoint known for driver " + driver);
      }

      this.status = 'Mounting';
      orbiter
        .invoke("/rom/drv/nsimport/invoke", {
          'endpoint-url': Orbiter.String(endpointUri),
        }, `/n/${driver}`).then(out => {
          this.status = 'Mounted successfully';
        }, err => {
          this.status = 'Mounting crashed';
        });
    },

  },
});
