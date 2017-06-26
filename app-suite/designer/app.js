const skylink = new Skylink();
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
    skylink.enumerate(this.path, {includeRoot: false}).then(children => {
      this.contextShape = '';
      this.inputShape = '';
      this.outputShape = '';
      this.sourceFile = '';

      children.forEach(child => {
        if (child.Name === 'context-shape') {
          this.contextShape = child.StringValue;
        } else if (child.Name === 'input-shape') {
          this.inputShape = child.StringValue;
        } else if (child.Name === 'output-shape') {
          this.outputShape = child.StringValue;
        } else if (child.Name.startsWith('source.') && child.Type === 'File') {
          this.sourceFile = child.Name;
        }
      });
    });
  },
  methods: {
    setShape(prop) {
      const value = this[prop + 'Shape'];
      const path = this.path + '/' + prop + '-shape';

      if (value) {
        skylink.putString(path, value);
      } else {
        skylink.unlink(path);
      }
    },
    openSource() {
      window.parent.app.openEditor({
        type: "edit-file",
        icon: "edit",
        label: this.func,
        path: `${this.path}/${this.sourceFile}`,
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
      skylink.enumerate(this.path, {
        includeRoot: false,
        maxDepth: 2,
      }).then(children => {
        this.type = '';
        this.props = [];
        this.nativeProps = [];

        children.forEach(child => {
          console.log('shape child', child);
          const parts = child.Name.split('/');

          if (child.Name === 'type') {
            this.type = child.StringValue;
          } else if (parts[0] === 'props' && parts.length === 2) {
            this.props.push({
              name: parts[1],
            });
          } else if (parts[0] === 'native-props' && parts.length === 2) {
            this.nativeProps.push({
              name: parts[1],
            });
          }
        });
      });
    },
    newProp() {
      const name = prompt(`New shape prop name:`);
      if (name) {
        return skylink
          .store(`${this.path}/props/${name}`, Skylink.Folder(name, [
            Skylink.String('type', 'String'),
          ]))
          .then(() => this.loadShape());
      }
    },
    newNativeProp() {
      const name = prompt(`New native prop name:`);
      if (name) {
        return skylink
          .mkdirp(`${this.path}/native-props`)
          .then(() => skylink.store(`${this.path}/native-props/${name}`, Skylink.Folder(name, [
            Skylink.String('type', ''),
          ])))
          .then(() => this.loadShape());
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
    native: Boolean,
  },
  data() {
    return {
      type: '',
      extras: [],
      target: '',
      optional: false,
      shorthand: false,
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
    skylink.enumerate(this.path).then(children => {
      this.type = '';
      this.optional = false;
      this.target = '';
      this.shorthand = false;

      children.forEach(child => {
        if (child.Name === '' && child.Type === 'String') {
          this.type = child.StringValue;
          this.shorthand = true;
        } else if (child.Name === 'type') {
          this.type = child.StringValue;
        } else if (child.Name === 'optional') {
          this.optional = child.StringValue === 'yes';
        } else if (child.Name === 'target') {
          this.target = child.StringValue;
        }
      });
    });
  },
  methods: {
    setType() {
      var path = this.path;
      if (!this.shorthand) {
        path += '/type';
      }
      skylink.putString(path, this.type);
    },
    setTarget() {
      if (this.shorthand) {
        alert(`Shorthands can't have a target`); // TODO
      } else if (this.target) {
        skylink.putString(this.path + '/target', this.target);
      } else {
        skylink.unlink(this.path + '/target');
      }
    },
    setOptional() {
      if (this.shorthand) {
        alert(`Shorthands can't be optional`); // TODO
      } else {
        skylink.putString(this.path + '/optional', this.optional ? 'yes' : 'no');
      }
    },
  },
});

var app = new Vue({
  el: '#app',
  data: {
    driver: 'irc-client',
    platform: '',
    drivers: [],
    functions: [],
    shapes: [],
  },
  methods: {
    loadDriverList() {
      skylink.enumerate(driverRoot)
        .then(x => x
              .filter(x => x.Type === 'Folder')
              .map(x => x.Name))
        .then(x => this.drivers = x);
    },
    loadDriver() {
      skylink.enumerate(`${driverRoot}/${this.driver}`, {
        maxDepth: 2,
      }).then(children => {
        this.functions = [];
        this.shapes = [];
        this.platform = '';

        children.forEach(child => {
          const parts = child.Name.split('/');
          if (parts[0] === 'functions' && parts.length === 2) {
            this.functions.push(parts[1]);
          } else if (parts[0] === 'shapes' && parts.length === 2) {
            this.shapes.push(parts[1]);
          } else if (child.Name === 'platform') {
            this.platform = child.StringValue;
          }
        });
      });
    },
    newFunc() {
      const name = prompt(`New function name:`);
      const goName = ('-' + name).replace(/-./g, a => a[1].toUpperCase());
      if (name) {
        skylink.store(`${driverRoot}/${this.driver}/functions/${name}`, Skylink.Folder(name, [
          Skylink.String('output-shape', 'String'),
          Skylink.File('source.go', `func ${goName}Impl() string {\n  return "hello world";\n}`),
        ])).then(() => this.loadDriver());
      }
    },
    newShape() {
      const name = prompt(`New shape name:`);
      if (name) {
        skylink.store(`${driverRoot}/${this.driver}/shapes/${name}`, Skylink.Folder(name, [
          Skylink.String('type', 'Folder'),
          Skylink.Folder('props'),
        ])).then(() => this.loadDriver());
      }
    },
    newDriver() {
      const name = prompt(`New driver name:`);
      if (name) {
        skylink.store(`${driverRoot}/${name}`, Skylink.Folder(name, [
          Skylink.String('platform', 'golang'),
          Skylink.File('deps.txt', ''),
          Skylink.Folder('functions'),
          Skylink.Folder('shapes'),
        ])).then(() => {
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
