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
    };
  },
  computed: {
    path() {
      return `${driverRoot}/${this.driver}/shapes/${this.shape}`;
    },
  },
  created() {
    orbiter.loadFile(this.path + '/type')
      .then(x => this.type = x);
    orbiter.loadMetadata(this.path + '/props')
      .then(entry => entry.children
        .map(x => {return {name: x.name, shorthand: x.type === 'String'}}))
      .then(x => this.props = x);
  },
  methods: {

  },
});

Vue.component('shape-prop', {
  template: '#shape-prop',
  props: {
    driver: String,
    shape: String,
    prop: String,
    shorthand: Boolean,
  },
  data() {
    return {
      type: '',
      extras: [],
      target: '',
    };
  },
  computed: {
    path() {
      return `${driverRoot}/${this.driver}/shapes/${this.shape}/props/${this.prop}`;
    },
    functions() {
      return app.functions;
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
    loadDriver() {
      this.functions = [];
      this.shapes = [];
      orbiter.listChildren(`${driverRoot}/${this.driver}/functions`)
        .then(names => this.functions = names);
      orbiter.listChildren(`${driverRoot}/${this.driver}/shapes`)
        .then(names => this.shapes = names);
    },
  },
  created() {
    orbiter.listChildren(driverRoot, x => x.type === 'Folder')
      .then(names => this.drivers = names);
     this.loadDriver();
  },
});
