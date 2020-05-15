const skylink = new Skylink();

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

      skylink
        .invoke(app.apiPath + "/commit/invoke", Skylink.Folder('input', [
          Skylink.String('message', this.message),
          Skylink.String('author-name', this.aName),
          Skylink.String('author-email', this.aEmail),
          Skylink.String('all', this.all ? 'yes' : 'no'),
        ])).then(out => {
           app.running = false;
          this.message = '';
          if (out && out.StringValue) {
            this.output += "\n" + out.StringValue;
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

      skylink
        .invoke(this.apiPath + "/status/invoke")
        .then(out => {
          this.status = [];
          this.running = false;
          if (out && out.StringValue) {
            this.status = out.StringValue.split("\n").slice(0, -1).map(line => {
              return {
                stage: line[0],
                tree: line[1],
                path: line.slice(3),
              };
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

      skylink
        .invoke(this.apiPath + "/add/invoke", Skylink.Folder('input', [
          Skylink.String('path', path),
        ]))
        .then(out => {
          this.running = false;
          if (out) {
            this.output += "\n" + out.StringValue;
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

      skylink
        .invoke(this.apiPath + "/push/invoke", Skylink.Folder('input'))
        .then(out => {
          this.running = false;
          if (out) {
            this.output = out.StringValue;
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

      skylink
        .invoke(this.apiPath + "/pull/invoke", Skylink.Folder('input'))
        .then(out => {
          this.running = false;
          if (out) {
            this.output = out.StringValue;
          }
        }, err => {
          alert("git pull failed.\n\n" + err.stack);
          this.running = false;
        });
    },
  },
});
