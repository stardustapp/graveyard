Vue.component('resource-menu', {
  template: '#resource-menu',
  data: () => ({
  }),
  computed: {
    types: () => Object.keys(packageContext.resourceTypes),
  },
  methods: {
    ofType(type) {
      return packageContext.resources.filter(x => x.type === type);
    },
  },
});

Vue.component('app-header', {
  template: '#app-header',
  data: () => ({
    pkgMeta: packageContext.metadata,
  }),
});

Vue.component('res-item', {
  template: '#res-item',
  props: {
    id: String,
    type: String,
    name: String,
  },
});

const EditResource = Vue.component('edit-resource', {
  template: '#edit-resource',
  props: {
    type: String,
    name: String,
  },
});

const CreateResource = Vue.component('create-resource', {
  template: '#create-resource',
  props: {
  },
  data: () => ({
    resTypes: packageContext.resourceTypes,
    name: '',
    type: '',
    engineChoices: [],
    engine: null,
  }),
  watch: {
    '$route': {
      immediate: true,
      handler(to, from) {
        this.name = '';
        this.type = to.query.type;
        this.engineChoices = AllEngineChoices[this.type] || [];
        this.engine = (this.engineChoices[0] || {}).key;
      },
    },
  },
  methods: {
    submit(evt) {
      const {name, type} = evt.target;
      console.log(name.value, type.value);
    },
  },
});

const EditMetadata = Vue.component('edit-metadata', {
  template: '#edit-metadata',
});

const MissingRoute = Vue.component('missing-route', {
  template: '#missing-route',
  mounted() {
    const {menuToggle} = this.$refs;
    menuToggle.openMenu();
  },
});

const router = new VueRouter({
  mode: 'hash',
  routes: [
    { name: 'edit-resource', path: '/resource/:type/:name', component: EditResource },
    { name: 'create-resource', path: '/create-resource', component: CreateResource },
    { name: 'edit-metadata', path: '/edit-metadata', component: EditMetadata },
    { name: 'missing-route', path: "*", component: MissingRoute },
  ],
});

var app = new Vue({
  el: '#app',
  router,
  data: {
  },
});
