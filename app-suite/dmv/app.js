const sourceOrbiter = new Orbiter('/n/aws-ns/native-drivers');
const kubeOrbiter = new Orbiter('/n/kube-apt');

var app = new Vue({
  el: '#app',
  data: {
    driverList: [],
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
      var input = {
        name: Orbiter.String(`sd-builddriver-${driver}`),
        image: Orbiter.String('stardustapp/utils'),
        command: Orbiter.String(`stardust-build-driver http://star-router-http/~~ ${driver}`),
        privileged: Orbiter.String('yes'),
      };

      this.status = 'Pending';
      kubeOrbiter
        .invoke("/run-pod/invoke", input, true)
        .then(out => {
          this.status = 'Completed';
          if (out) {
            // TODO: depends on output type
            out
              .loadFile('')
              .then(x => this.output = x);
          } else {
            this.output = null;
          }
        }, err => {
          this.status = 'Crashed';
        });
        //.then(x => console.log('invocation got', x));
    },

  },
});
