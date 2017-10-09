const skylinkP = Skylink.openChart();
var skylink = null;
skylinkP.then(x => skylink = x);

const driverRoot = '/state/native-drivers';

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
    remove() {
      skylink.unlink(this.path)
        .then(() => alert('ok'));
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
    remove() {
      skylink.unlink(this.path)
        .then(() => alert('ok'));
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
    remove() {
      skylink.unlink(this.path)
        .then(() => alert('ok'));
    },
  },
});

var app = new Vue({
  el: '#app',
  data: {
    driver: 'redis-ns',
    platform: '',
    drivers: [],
    functions: [],
    shapes: [],
  },
  methods: {
    loadDriverList() {
      return skylink.enumerate(driverRoot)
        .then(x => x
              .filter(x => x.Type === 'Folder')
              .map(x => x.Name))
        .then(x => this.drivers = x);
    },
    loadDriver() {
      return skylink.enumerate(`${driverRoot}/${this.driver}`, {
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
        ]))
          .then(() => this.loadDriverList())
          .then(() => this.driver = name)
          .then(() => this.loadDriver());
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

    exportDrivers() {
      // const driverRoot = '/n/redis-ns/native-drivers';
      const exportSkylink = new Skylink(driverRoot+'-export', skylink);
      return exportSkylink.unlink('')
        .then(() => exportSkylink.store('', Skylink.Folder('native-drivers')))
        .then(() => skylink.enumerate(driverRoot, {
          includeRoot: false,
        }))
        .then(list => list.map(entry => {
          if (entry.Type === 'Folder') {
            return this.exportDriver(entry.Name);
          } else {
            return skylink
              .get(driverRoot + '/' + entry.Name)
              .then(out => exportSkylink.store('/' + entry.Name, out));
          }
        }))
        .then(list => Promise.all(list))
        .then(x => alert(`Exported all ${x.length} drivers!`));
    },

    exportDriver(driver) {
      const exportSkylink = new Skylink(driverRoot+'-export/'+driver, skylink);
      return exportSkylink
        .store('', Skylink.Folder(driver, [
          Skylink.Folder('functions'),
          Skylink.Folder('shapes'),
        ]))
        .then(() => skylink.enumerate(driverRoot + '/' + driver, {
          includeRoot: false,
          maxDepth: -1,
        }))
        .then(list => {
          const shapes = new Map();
          const functions = new Map();
          var metaYaml = '';
          const promises = [];
          list.forEach(entry => {
            const parts = entry.Name.split('/');

                   if (parts[0] === 'functions' && parts.length === 1) {
            } else if (parts[0] === 'functions' && parts.length === 2) {
              functions.set(parts[1], {
                name: parts[1],
              });
            } else if (parts[0] === 'functions' && parts[2] === 'context-shape') {
              functions.get(parts[1]).contextShape = entry.StringValue;
            } else if (parts[0] === 'functions' && parts[2] === 'input-shape') {
              functions.get(parts[1]).inputShape = entry.StringValue;
            } else if (parts[0] === 'functions' && parts[2] === 'output-shape') {
              functions.get(parts[1]).outputShape = entry.StringValue;

            } else if (parts[0] === 'functions' && parts[2] && parts[2].startsWith('source.')) {
              const newName = `/functions/${parts[1]}.` + parts[2].split('.')[1];
              promises.push(skylink
                            .get(driverRoot + '/' + driver + '/' + entry.Name)
                            .then(out => exportSkylink.store(newName, out)));

            } else if (parts[0] === 'shapes' && parts.length === 1) {
            } else if (parts[0] === 'shapes' && parts.length === 2) {
              shapes.set(parts[1], {
                name: parts[1],
                type: 'Folder',
                props: new Map(),
                nativeProps: new Map(),
              });
            } else if (parts[0] === 'shapes' && parts[2] === 'type') {
              shapes.get(parts[1]).type = entry.StringValue;

            } else if (parts[0] === 'shapes' && parts[2] === 'props' && parts.length === 3) {
            } else if (parts[0] === 'shapes' && parts[2] === 'props' && parts.length === 4) {
              shapes.get(parts[1]).props.set(parts[3], {
                name: parts[3],
              });
              if (entry.Type === 'String') {
                shapes.get(parts[1]).props.get(parts[3]).type = entry.StringValue;
              }
            } else if (parts[0] === 'shapes' && parts[2] === 'props' && parts[4] === 'type') {
              shapes.get(parts[1]).props.get(parts[3]).type = entry.StringValue;
            } else if (parts[0] === 'shapes' && parts[2] === 'props' && parts[4] === 'target') {
              shapes.get(parts[1]).props.get(parts[3]).target = entry.StringValue;
            } else if (parts[0] === 'shapes' && parts[2] === 'props' && parts[4] === 'optional') {
              shapes.get(parts[1]).props.get(parts[3]).optional = entry.StringValue === 'yes';

            } else if (parts[0] === 'shapes' && parts[2] === 'native-props' && parts.length === 3) {
            } else if (parts[0] === 'shapes' && parts[2] === 'native-props' && parts.length === 4) {
              shapes.get(parts[1]).nativeProps.set(parts[3], {
                name: parts[3],
              });
              if (entry.Type === 'String') {
                shapes.get(parts[1]).nativeProps.get(parts[3]).type = entry.StringValue;
              }
            } else if (parts[0] === 'shapes' && parts[2] === 'native-props' && parts[4] === 'type') {
              shapes.get(parts[1]).nativeProps.get(parts[3]).type = entry.StringValue;

            } else if (parts.length === 1 && entry.Type === 'File') {
              promises.push(skylink
                            .get(driverRoot + '/' + driver + '/' + entry.Name)
                            .then(out => exportSkylink.store('/' + entry.Name, out)));

            } else if (parts.length === 1 && entry.Type === 'String') {
              metaYaml += `${entry.Name}: "${entry.StringValue}"\n`;

            } else {
              console.log('export of', driver, 'missed', entry);
            }
          });

          shapes.forEach(shape => {
            var yaml = `type: "${shape.type}"\n\n`;

            if (shape.props.size > 0) {
              yaml += `props:\n`;
            }
            shape.props.forEach(prop => {
              yaml += `- name: "${prop.name}"\n`;
              yaml += `  type: "${prop.type}"\n`;
              if (prop.target)
                yaml += `  target: "${prop.target}"\n`;
              if (prop.optional)
                yaml += `  optional: ${prop.optional}\n`;
              yaml += `\n`;
            });

            if (shape.nativeProps.size > 0) {
              yaml += `native-props:\n`;
            }
            shape.nativeProps.forEach(prop => {
              yaml += `- name: "${prop.name}"\n`;
              yaml += `  type: "${prop.type}"\n\n`;
            });

            promises.push(exportSkylink.putFile(`/shapes/${shape.name}.yaml`, yaml));
          });

          functions.forEach(func => {
            var yaml = '';

            if (func.contextShape)
              yaml += `context-shape: "${func.contextShape}"\n`;
            if (func.inputShape)
              yaml += `input-shape: "${func.inputShape}"\n`;
            if (func.outputShape)
              yaml += `output-shape: "${func.outputShape}"\n`;

            promises.push(exportSkylink.putFile(`/functions/${func.name}.yaml`, yaml));
          });

          promises.push(exportSkylink.putFile(`/metadata.yaml`, metaYaml));
          return Promise.all(promises);
        });
    },

  },
  created() {
    skylinkP.then(() => {
      this.loadDriverList();
      this.loadDriver();
    });
  },
});
