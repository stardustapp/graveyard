
Vue.component('res-item', {
  template: '#res-item',
  props: {
    network: String,
    type: String,
    context: String,
  },
});

const EditResource = Vue.component('edit-resource', {
  template: '#edit-resource',
  props: {
    network: String,
    type: String,
    context: String,
  },
});

const CreateResource = Vue.component('create-resource', {
  template: '#create-resource',
  props: {
    network: String,
    type: String,
    context: String,
  },
});

const EditMetadata = Vue.component('edit-metadata', {
  template: '#edit-metadata',
});

const MissingRouteHandler = Vue.component('missing-route', {
  template: `
<div id="missing-route">
  <h2>
    <sky-menu-toggle ref="menuToggle" />
    <span>Welcome to Skychat!</span>
  </h2>
  <p>Select a channel to get started :)</p>
  <p><a href="config.html">Settings & Network Configuration</a></p>
  <p>Built and hosted by <a href="http://danopia.net" target="_blank">Daniel Lamando</a></p>
  <p class="ps-note">PS: No channels? Your profile might not be provisioned for IRC.</p>
</div>`,
  mounted() {
    const {menuToggle} = this.$refs;
    menuToggle.openMenu();
  },
});

const router = new VueRouter({
  mode: 'hash',
  routes: [
    { name: 'edit-resource', path: '/resource/:resName', component: EditResource, props: true },
    { name: 'create-resource', path: '/create-resource', component: CreateResource, props: true },
    { name: 'edit-metadata', path: '/edit-metadata', component: EditMetadata },
    { name: 'missing-route', path: "*", component: MissingRouteHandler },
  ],
});

var app = new Vue({
  el: '#app',
  router,
  data: {
    resTypes: ['CustomRecord', 'Dependency', 'Publication', 'RouteTable', 'ServerMethod', 'Template'],
  },
  methods: {
    resources(type) {
      return [];
    }
  },
  mounted () {
  },
  created() {
  },
});
