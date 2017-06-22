const orbiter = new Orbiter();

Vue.component('commit', {
  template: '#commit',
  data() {
    return {
      message: '',
      aName: 'Daniel Lamando',
      aEmail: 'dan+stardust@danopia.net',
      all: true,
    };
  },
  computed: {
    running() {
      return app.running === 'commit';
    },
  },
  methods: {
    submit() {
      if (app.running) return;
      app.running = 'commit';
      app.output = '+ git commit';

      orbiter
        .invoke(app.apiPath + "/commit/invoke", {
          'message': Orbiter.String(this.message),
          'author-name': Orbiter.String(this.aName),
          'author-email': Orbiter.String(this.aEmail),
          'all': Orbiter.String(this.all ? 'yes' : 'no'),
        }, true).then(out => {
          if (out) {
            out.loadFile('').then(x => {
              this.message = '';
              this.output += "\n" + x;
              app.running = false;
            });
          }
        }, err => {
          alert("git commit failed.\n\n" + err.stack);
          app.running = false;
        });
    },
  },
});

var app = new Vue({
  el: '#app',
  data: {
    apiPath: '/n/apps-git',
    running: false,
    mode: '',
    status: [],
    output: '',
  },
  methods: {

    runStatus() {
      if (this.running) return;
      this.running = 'status';
      this.output = '+ git status';
      this.mode = 'status';
      this.status = [];

      orbiter
        .invoke(this.apiPath + "/status/invoke", {}, true)
        .then(out => {
          if (out) {
            out.loadFile('').then(x => {
              this.status = x.split("\n").slice(0, -1).map(line => {
                return {
                  stage: line[0],
                  tree: line[1],
                  path: line.slice(3),
                };
              });
              this.running = false;
            });
          }
        }, err => {
          alert("git status failed.\n\n" + err.stack);
          this.running = false;
        });
    },

    addPath(path) {
      if (this.running) return;
      this.running = 'add ' + path
      this.output = '+ git add ' + path;

      orbiter
        .invoke(this.apiPath + "/add/invoke", {
          path: Orbiter.String(path),
        }, true)
        .then(out => {
          if (out) {
            out.loadFile('').then(x => {
              this.output += "\n" + x;
              this.running = false;
            });
          }
        }, err => {
          alert("git add failed.\n\n" + err.stack);
          this.running = false;
        });
    },

    runPush() {
      if (this.running) return;
      this.running = 'push';
      this.output = '+ git push';
      this.mode = 'push';

      orbiter
        .invoke(this.apiPath + "/push/invoke", {}, true)
        .then(out => {
          if (out) {
            out.loadFile('').then(x => {
              this.output = x;
              this.running = false;
            });
          }
        }, err => {
          alert("git push failed.\n\n" + err.stack);
          this.running = false;
        });
    },

    runPull() {
      if (this.running) return;
      this.running = 'pull';
      this.output = '+ git pull';
      this.mode = 'pull';

      orbiter
        .invoke(this.apiPath + "/pull/invoke", {}, true)
        .then(out => {
          if (out) {
            out.loadFile('').then(x => {
              this.output = x;
              this.running = false;
            });
          }
        }, err => {
          alert("git pull failed.\n\n" + err.stack);
          this.running = false;
        });
    },
  },
});
