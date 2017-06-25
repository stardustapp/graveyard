const orbiter = new Orbiter();
const driverRoot = '/n/redis-ns/native-drivers';

Vue.component('function', {
  template: '#function',
  props: {
    driver: String,
    func: String,
  },
  data() {
    return {
      contextShape: '',
      inputShape: '',
      outputShape: '',
      sourceFile: '',
    };
  },
  computed: {
    path() {
      return `${driverRoot}/${this.driver}/functions/${this.func}`;
    },
    shapes() {
      return app.shapes;
    },
  },
  created() {
    orbiter.listChildren(this.path).then(names => {
      if (names.includes('context-shape')) {
        orbiter.loadFile(this.path + '/context-shape')
          .then(x => this.contextShape = x);
      } else {
        this.contextShape = '';
      }
      if (names.includes('input-shape')) {
        orbiter.loadFile(this.path + '/input-shape')
          .then(x => this.inputShape = x);
      } else {
        this.inputShape = '';
      }
      if (names.includes('output-shape')) {
        orbiter.loadFile(this.path + '/output-shape')
          .then(x => this.outputShape = x);
      } else {
        this.outputShape = '';
      }
    });
  },
  methods: {
    setShape(prop) {
      const value = this[prop + 'Shape'];
      const path = this.path + '/' + prop + '-shape';

      if (value) {
        orbiter.putString(path, value);
      } else {
        orbiter.delete(path);
      }
    },
    openSource() {
      window.parent.app.openEditor({
        type: "edit-file",
        icon: "edit",
        label: this.func,
        path: `${this.path}/source.go`,
      });
    },
  },
});

Vue.component('shape', {
  template: '#shape',
  props: {
    driver: String,
    shape: String,
  },
  data() {
    return {
      type: '',
      props: [],
      nativeProps: [],
    };
  },
  computed: {
    path() {
      return `${driverRoot}/${this.driver}/shapes/${this.shape}`;
    },
  },
  created() {
    this.loadShape();
  },
  methods: {
    loadShape() {
      orbiter.loadFile(this.path + '/type')
        .then(x => this.type = x);
      orbiter.loadMetadata(this.path + '/props')
        .then(entry => entry.children
          .map(x => {return {name: x.name, shorthand: x.type !== 'Folder'}}))
        .then(x => this.props = x);
      orbiter.loadMetadata(this.path + '/native-props')
        .then(entry => entry.children
          .map(x => {return {name: x.name, shorthand: x.type !== 'Folder'}}))
        .then(x => this.nativeProps = x);
    },
    newProp() {
      const name = prompt(`New shape prop name:`);
      if (name) {
        orbiter.putFolderOf(`${this.path}/props/${name}`, {
          'type': Orbiter.String('String'),
        }).then(() => this.loadShape());
      }
    },
    newNativeProp() {
      const name = prompt(`New native prop name:`);
      if (name) {
        orbiter.mkdirp(`${this.path}/native-props`)
        .then(() => orbiter.putFolderOf(`${this.path}/native-props/${name}`, {
          'type': Orbiter.String(''),
        })).then(() => this.loadShape());
      }
    },
  },
});

Vue.component('shape-prop', {
  template: '#shape-prop',
  props: {
    driver: String,
    shape: String,
    prop: String,
    shorthand: Boolean,
    native: Boolean,
  },
  data() {
    return {
      type: '',
      extras: [],
      target: '',
      optional: false,
    };
  },
  computed: {
    path() {
      var typePart = 'props';
      if (this.native) {
        typePart = 'native-props';
      }
      return `${driverRoot}/${this.driver}/shapes/${this.shape}/${typePart}/${this.prop}`;
    },
    functions() {
      return app.functions;
    },
    shapes() {
      return app.shapes;
    },
  },
  created() {
    if (this.shorthand) {
      orbiter.loadFile(this.path)
        .then(x => this.type = x);

      this.extras = [];
      this.target = '';

    } else {
      orbiter.loadFile(this.path + '/type')
        .then(x => this.type = x);

      orbiter.loadFile(this.path + '/optional')
        .then(x => this.optional = x === 'yes');

      orbiter.listChildren(this.path).then(x => {
        this.extras = x.filter(y => y.name !== 'type');

        if (this.extras.includes('target')) {
          orbiter.loadFile(this.path + '/target')
            .then(x => this.target = x);
        } else {
          this.target = '';
        }

      });
    }
  },
  methods: {
    setType() {
      var path = this.path;
      if (!this.shorthand) {
        path += '/type';
      }
      orbiter.putString(path, this.type);
    },
    setTarget() {
      if (this.shorthand) {
        alert(`Shorthands can't have a target`); // TODO
      } else if (this.target) {
        orbiter.putString(this.path + '/target', this.target);
      } else {
        orbiter.delete(this.path + '/target');
      }
    },
    setOptional() {
      if (this.shorthand) {
        alert(`Shorthands can't be optional`); // TODO
      } else {
        orbiter.putString(this.path + '/optional', this.optional ? 'yes' : 'no');
      }
    },
  },
});

var app = new Vue({
  el: '#app',
  data: {
    driver: 'hue-client',
    drivers: [],
    functions: [],
    shapes: [],
  },
  methods: {
    loadDriverList() {
      orbiter.listChildren(driverRoot, x => x.type === 'Folder')
        .then(names => this.drivers = names);
    },
    loadDriver() {
      this.functions = [];
      this.shapes = [];
      orbiter.listChildren(`${driverRoot}/${this.driver}/functions`)
        .then(names => this.functions = names);
      orbiter.listChildren(`${driverRoot}/${this.driver}/shapes`)
        .then(names => this.shapes = names);
    },
    newFunc() {
      const name = prompt(`New function name:`);
      const goName = ('-' + name).replace(/-./g, a => a[1].toUpperCase());
      if (name) {
        orbiter.putFolderOf(`${driverRoot}/${this.driver}/functions/${name}`, {
          'output-shape': Orbiter.String('String'),
          'source.go': Orbiter.String(`func ${goName}Impl() string {\n  return "hello world";\n}`),
        }).then(() => this.loadDriver());
      }
    },
    newShape() {
      const name = prompt(`New shape name:`);
      if (name) {
        orbiter.putFolderOf(`${driverRoot}/${this.driver}/shapes/${name}`, {
          'type': Orbiter.String('Folder'),
          'props': Orbiter.Folder({}),
        }).then(() => this.loadDriver());
      }
    },
    newDriver() {
      const name = prompt(`New driver name:`);
      if (name) {
        orbiter.putFolderOf(`${driverRoot}/${name}`, {
          'platform': Orbiter.String('golang'),
          'deps.txt': Orbiter.File(''),
          'functions': Orbiter.Folder({}),
          'shapes': Orbiter.Folder({}),
        }).then(() => {
          this.loadDriverList();
          this.driver = name;
        });
      }
    },
    openDeps() {
      window.parent.app.openEditor({
        type: "edit-file",
        icon: "edit",
        label: 'dependencies',
        path: `${driverRoot}/${this.driver}/deps.txt`,
      });
    },
  },
  created() {
    this.loadDriverList();
    this.loadDriver();
  },
});
