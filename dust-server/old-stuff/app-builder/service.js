const ALL_RES_TYPES = {
  //'RecordType',
  //'Dependency',
  //'Publication',
  'Router': {
    engines: [
      { key: 'uri', name: 'URI pattern matching' },
      { key: 'path', name: 'Path pattern matching' },
      { key: 'name', name: 'Single-name identity matching' },
    ],
  },
  'Method': {
    engines: [
      //{ key: 'lua', name: 'Stardust Lua' },
      //{ key: 'js', name: 'Plain JavaScript' },
      { key: 'http', name: 'HTTP request' },
    ],
    // with optional pre/post-process hooks that call other methods
  },
  'Schema': {
    engines: [
      { key: 'record', name: 'Data record schema' },
      { key: 'tree', name: 'Stardust tree entry' },
      //{ key: 'document', name: 'JSON document schema' },
    ],
  },
  'DataStore': {
    engines: [
      { key: 'idb', name: 'IndexedDB collection' },
      { key: 'tree', name: 'Stardust entry tree' },
      { key: 'import', name: 'Remote Stardust tree' },
    ],
  },
  'VirtualResource': {
    engines: [
      { key: '', name: 'IndexedDB collection' },
    ],
  },
  'Template': {
    engines: [
      { key: 'vue2', name: 'Vue 2.x' },
    ],
  },
};

PackageContext = Vue.extend({
  props: {
    packageId: String,
  },
  data: () => ({
    metadata: {},
    resources: [],
    resourceTypes: ALL_RES_TYPES,
  }),

  methods: {
    async loadManifest() {
      const data = await this.callSoftwareApi(['get package', this.packageId]);
      this.metadata = data.metadata;
      this.resources = data.resources;
      console.log('Loaded package info for', this.packageId, this.metadata.displayName);
    },
    getResource(path) {
      return this.callSoftwareApi(['get resource', this.packageId, path]);
    },
    async commitResource(newRevision) {
      const data = await this.callSoftwareApi(['commit resource', this.packageId], {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'content-type': 'application/json',
        },
      });
      console.log('commit response:', data, newRevision);
    },

    // sends an 'HTTP' request to the in-browser serviceworker
    // sanitizes the tokens passed
    async callSoftwareApi(names=[], opts={}) {
      const fragment = new PathFragment(false, ['/', 'software-api']);
      names.forEach(fragment.pushName.bind(fragment));
      const resp = await fetch(fragment.toString(), opts);
      if (resp.status >= 400) {
        throw new Error(`HTTP ${resp.status} received from software API for ${fragment}`);
      }
      return resp.json();
    },
  },

  created() {
    this.loadManifest();
  },

});

window.packageContext = new PackageContext({
  propsData: {
    packageId: location.search.slice(4),
  },
});
