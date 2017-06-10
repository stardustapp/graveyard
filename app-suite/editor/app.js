const roots = location.hash.slice(1).split(':');
const orbiter = new Orbiter();

// TODO
window.require = function (names) {
  console.log("'Requiring'", names)
}

Vue.component('entry-item', {
  template: '#entry-item',
  props: {
    stat: Object,
    name: String,
    type: String,
    path: String,
    startOpen: Boolean,
  },
  data() {
    return {
      entry: {},
      open: !!this.startOpen,
      loader: this.startOpen ? this.load() : null,
    };
  },
  computed: {
    isFunction() {
      return this.stat.shapes &&
          this.stat.shapes.indexOf('function') !== -1;
    },
    isFolder() {
      return this.type === "Folder";
    },
    icon() {
      if (this.isFunction) {
        return "flash_on"; // lightning bolt
      }
      switch (this.type) {
        case "Folder":
          return this.open ? "folder_open" : "folder";
        case undefined: // TODO: unugly
          return this.open ? "expand_less" : "chevron_right";
        default:
          return "insert_drive_file";
      }
    },
  },
  methods: {
    activate() {
      if (this.isFunction) {
        app.openEditor({
          type: 'invoke-function',
          label: this.name,
          icon: 'flash_on',
          path: this.path,
          bare: false,
        });
        return;
      }

      switch (this.type) {
        case 'Folder':
          this.open = !this.open;
          this.load();
          break;

        case 'File':
          app.openEditor({
            type: 'edit-file',
            label: this.name,
            icon: 'edit',
            path: this.path,
            dirty: false,
            untouched: true,
          });
          break;

        case 'String':
          app.openEditor({
            type: 'edit-string',
            label: this.name,
            icon: 'edit',
            path: this.path,
            dirty: false,
            untouched: true,
          });
          break;

        case 'Function':
          app.openEditor({
            type: 'invoke-function',
            label: this.name,
            icon: 'flash_on',
            path: this.path,
            bare: true,
          });
          break;
      }
    },
    load() {
      if (!this.loader) {
        this.loader = orbiter.loadMetadata(this.path, {
          shapes: ['/rom/shapes/function'],
        }).then(x => {
          x.children = x.children.sort((a, b) => {
            var nameA = a.name.toUpperCase();
            var nameB = b.name.toUpperCase();
            if (nameA < nameB) { return -1; }
            if (nameA > nameB) { return 1; }
            return 0;
          });
          return x;
        });

        this.loader.then(x => this.entry = x);
      }
      return this.loader;
    },
    reload() {
      this.loader = null;
      return this.load();
    },
  }
});

Vue.component('create-entry-item', {
  template: '#create-entry-item',
  props: {
    parent: String,
    parentName: String,
  },
  methods: {
    activate() {
      app.openEditor({
        type: 'create-name',
        label: 'create (' + this.parentName + ')',
        icon: 'add',
        path: this.parent,
      });
    },
  }
});

Vue.component('create-name', {
  template: '#create-name',
  props: {
    tab: Object,
  },
  data() {
    return {
      name: '',
      type: 'File',
    };
  },
  computed: {
  },
  methods: {
    submit() {
      if (!this.name.length) {
        alert("Enter a name!");
        return;
      }
      const fullPath = this.tab.path + '/' + this.name;

      switch (this.type) {
      case "File":
        // Don't actually create yet, just open a buffer
        app.openEditor({
          type: "edit-file",
          icon: "edit",
          label: this.name,
          path: fullPath,
          isNew: true,
          dirty: true,
        });
        app.closeTab(this.tab);
        break;

      case "String":
        // Don't actually create yet, just open a buffer
        app.openEditor({
          type: "edit-string",
          icon: "edit",
          label: this.name,
          path: fullPath,
          isNew: true,
          dirty: true,
        });
        app.closeTab(this.tab);
        break;

      case "Folder":
        orbiter.putFolder(fullPath).then(x => {
          alert('Created');
          const parent = app.selectTreeNode(this.tab.path);
          if (parent != null && parent.reload) {
            parent.reload();
            // TODO: ensure child is already open
          }
          app.closeTab(this.tab);
        });
        break;

      default:
        alert(`I don't know how to make a ${this.type} yet`)
      }
    },
  }
});

Vue.component('invoke-function', {
  template: '#invoke-function',
  props: {
    tab: Object,
  },
  data() {
    return {
      props: [],
      status: '',
      input: {},
      output: null,
      inputType: '',
      outputType: '',
      //output: null,
    };
  },
  computed: {
  },
  methods: {
    invoke() {
      var invokePath = this.tab.path;
      if (!this.tab.bare) {
        invokePath += '/invoke';
      }

      var input = {};
      this.props.forEach(prop => {
        var val = this.input[prop.name];
        if (!val) {
          if (!prop.optional) {
            alert(`Property ${prop.name} is required`);
          }
          return;
        }

        switch (prop.type) {
          case 'String':
            input[prop.name] = Orbiter.String(val);
            break;

          default:
            alert(`Property ${prop.name} is supported to be unknown type ${prop.type}`);
        }
      });

      this.output = null;
      this.status = 'Pending';
      orbiter
        .invoke(invokePath, input, true)
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
    getInputProps() {
      const propsPath = this.tab.path + '/input-shape/props';
      orbiter.loadMetadata(propsPath, {
        shapes: ['/rom/shapes/function'],
      }).then(x => x.children.map(child => {
        if (child.type === 'String') {
          return orbiter
            .loadFile(propsPath + '/' + child.name)
            .then(typeV => {
              return {
                name: child.name,
                type: typeV,
                optional: false,
              };
            });
        } else if (child.type === 'Folder') {
          const typeP = orbiter
            .loadFile(propsPath + '/' + child.name + '/type');
          const optionalP = orbiter
            .loadFile(propsPath + '/' + child.name + '/optional')
            .then(raw => (raw === '/') + 'yes')
            .catch(ex => false);

          return Promise
            .all([typeP, optionalP])
            .then(values => {
              return {
                name: child.name,
                type: values[0],
                optional: values[1],
              };
            });
        }
      }))
        .then(x => Promise.all(x))
        .then(x => this.props = x);
    },
  },
  created() {
    orbiter
      .loadFile(this.tab.path + '/input-shape/type')
      .then(x => {
        this.inputType = x;
        if (x == 'Folder') {
          this.getInputProps();
        }
      });

    orbiter
      .loadFile(this.tab.path + '/output-shape/type')
      .then(x => {
        this.outputType = x;
        if (x == 'Folder') {
          //this.getInputProps();
        }
      });
  },
});

Vue.component('edit-file', {
  template: '#edit-file',
  props: {
    tab: Object,
  },
  data() {
    const pathParts = this.tab.path.split('/');
    return {
      source: '',
      editorOptions: {
        tabSize: 2,
        mode: {
          filename: pathParts[pathParts.length - 1],
        },
        styleActiveLine: true,
        lineWrapping: true,
        lineNumbers: true,
        line: true,
        styleSelectedText: true,
        matchBrackets: true,
        showCursorWhenSelecting: true,
        theme: "tomorrow-night-bright",
        extraKeys: {
          "Ctrl": "autocomplete",
        },
      }
    };
  },
  computed: {
    parentPath() {
      const pathParts = this.tab.path.split('/');
      return pathParts.slice(0, -1).join('/');
    },
    editor() {
      return this.$refs.editor.editor;
    },
  },
  methods: {
    onChange() {
      this.tab.dirty = (this.editor.getValue() !== this.source);

      // once a file is touched, let's keep it open
      if (this.tab.dirty) {
        this.tab.untouched = false;
      }
    },

    save() {
      // TODO: cleaning should be opt-in. via MIME?
      const input = this.editor.getValue();
      const source = input.replace(/\t/g, '  ').replace(/ +$/gm, '');
      if (input != source) {
        // TODO: transform cursor to account for replacement
        const cursor = this.editor.getCursor();
        this.editor.setValue(source);
        this.editor.setCursor(cursor);
        console.log('Updated buffer to cleaned version of source');
      }

      orbiter.putFile(this.tab.path, source).then(x => {
        alert('Saved');

        // update the dirty marker
        this.source = source;
        this.onChange();

        // If this file didn't exist yet, dirty the treeview
        if (this.tab.isNew === true) {
          this.tab.isNew = false;

          const parent = app.selectTreeNode(this.parentPath);
          if (parent != null && parent.reload) {
            parent.reload();
          }
        }
      });
    },
  },

  created() {
    this.onChange = debounce(this.onChange, 250);

    if (!this.tab.isNew) {
      orbiter
        .loadFile(this.tab.path)
        .then(x => this.source = x);
    }
  },
});


Vue.component('edit-string', {
  template: '#edit-string',
  props: {
    tab: Object,
  },
  data() {
    const pathParts = this.tab.path.split('/');
    return {
      source: '',
      value: '',
    };
  },
  computed: {
    parentPath() {
      const pathParts = this.tab.path.split('/');
      return pathParts.slice(0, -1).join('/');
    },
  },
  methods: {
    onChange() {
      this.tab.dirty = (this.value !== this.source);

      // once a string is touched, let's keep it open
      if (this.tab.dirty) {
        this.tab.untouched = false;
      }
    },

    save() {
      orbiter.putString(this.tab.path, this.value).then(x => {
        alert('Saved');

        // update the dirty marker
        this.source = this.value;
        this.onChange();

        // If this string didn't exist yet, dirty the treeview
        if (this.tab.isNew === true) {
          this.tab.isNew = false;

          const parent = app.selectTreeNode(this.parentPath);
          if (parent != null && parent.reload) {
            parent.reload();
          }
        }
      });
    },
  },

  created() {
    this.onChange = debounce(this.onChange, 100);

    if (!this.tab.isNew) {
      orbiter
        .loadFile(this.tab.path)
        .then(x => {
          this.source = x;
          this.value = x;
        });
    }
  },
});


var app = new Vue({
  el: '#app',
  data: {
    roots: roots,
    tabList: [],
    tabKeys: {},
    currentTab: null,
  },
  created() {
    window.addEventListener('keydown', this.handleKeyDown);
  },
  destroyed() {
    window.removeEventListener('keydown', this.handleKeyDown);
  },
  methods: {

    // Focus or open a new editor for given details
    openEditor(deets) {
      deets.key = [deets.path, deets.type].join(':');
      if (deets.key in this.tabKeys) {
        this.activateTab(this.tabKeys[deets.key]);
      } else {
        console.log("Opening editor", deets.key, 'labelled', deets.label);
        this.tabList.push(deets);
        this.tabKeys[deets.key] = deets;
        this.activateTab(deets);
      }
    },

    activateTab(tab) {
      if (tab && this.currentTab && this.currentTab !== tab && this.currentTab.untouched) {
        console.log('Closing untouched blurred tab', this.currentTab.key);
        this.closeTab(this.currentTab);
      }

      console.log("Switching to tab", tab.label);
      this.currentTab = tab;
    },

    closeTab(tab) {
      if (tab.dirty) {
        if (!confirm(`Close dirty tab ${tab.key}?`)) {
          return;
        }
      }

      const idx = this.tabList.indexOf(tab);
      console.log("Closing tab", tab.label, "idx", idx);
      if (idx !== -1) {
        this.tabList.splice(idx, 1);
        delete this.tabKeys[tab.key];

        if (this.currentTab === tab) {
          this.currentTab = null;
          this.activateTab(this.tabList[0]);
          //const idx = this.tabList.indexOf(this.currentTab);
        }
      }
    },

    // Given /n/osfs/index.html, selects the 'index.html' component or null if it's not loaded
    selectTreeNode(path) {
      // TODO: return a list from multiple trees
      var node = this.$refs.trees.find(tree => path.startsWith(tree.path));
      if (!node) { return null; }

      // get path parts after the common prefix
      const parts = path.slice(node.path.length + 1).split('/');
      if (parts.length == 1 && parts[0] === '') {
        parts.pop();
      }

      while (parts.length && node != null && 'children' in (node.$refs || {}) ) {
        const part = parts.shift();
        node = node.$refs.children.find(child => child.name === part);
      }

      if (parts.length === 0) {
        return node;
      }
    },

    offsetTabIdx(baseTab, offset) {
      const idx = this.tabList.indexOf(baseTab);
      if (idx === -1) {
        return console.log('Tab', baseTab.key, 'not found');
      }
      const newIdx = idx + offset;
      if (newIdx >= 0 && newIdx < this.tabList.length) {
        this.activateTab(this.tabList[newIdx]);
      }
    },

    handleKeyDown(evt) {
      var tab;
      if (this.currentTab && this.$refs.tabElems) {
        tab = this.$refs.tabElems
          .find(elem => (elem.tab||{}).key === this.currentTab.key);
      }

      switch (true) {

      // previous/next tab
      case evt.code === 'Comma' && evt.ctrlKey:
      case evt.code === 'BracketLeft' && evt.metaKey:
        this.offsetTabIdx(tab.tab, -1);
        break;
      case evt.code === 'Period' && evt.ctrlKey:
      case evt.code === 'BracketRight' && evt.metaKey:
        this.offsetTabIdx(tab.tab, 1);
        break;

      case evt.code === 'KeyS' && evt.metaKey:
        if (tab) {
          evt.preventDefault();
          console.log('Saving tab:', tab.tab.label);
          tab.save();
        }
        break;

      case evt.code === 'KeyA' && evt.metaKey:
        if (tab) {
          evt.preventDefault();
          console.log('Closing tab:', tab.tab.label);
          this.closeTab(tab.tab);
        }
        break;

      case evt.code === 'KeyN' && evt.metaKey:
        if (tab) {
          evt.preventDefault();
          const pathParts = tab.tab.path.slice(1).split('/');
          this.openEditor({
            type: "create-name",
            label: "create (" + pathParts[pathParts.length - 2] + ")",
            icon: "add",
            path: "/" + pathParts.slice(0, -1).join('/'),
          });
        }
        break;

      default:
        console.log('key', evt.code, evt.metaKey);

      }
    },
  },

});
