var chartName = 'public';
if (location.search) {
  chartName = location.search
    .slice(1)
    .split('&')
    .map(x => x.split('='))
    .filter(x => x[0] === 'chart')
    [0][1];
}

const roots = (location.hash.slice(1) || '').split(':');
const skylinkP = Skylink.openChart(chartName);
var skylink = null;
skylinkP.then(x => skylink = x);

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
      return this.stat.Shapes &&
          this.stat.Shapes.indexOf('/rom/shapes/function') !== -1;
    },
    canLaunch() {
      return this.path.match(/^\/web\/[a-z]+$/) || (this.stat.Shapes &&
          this.stat.Shapes.indexOf('/rom/shapes/web-app') !== -1);
    },
    launchUri() {
      return '/~' + chartName + this.path.replace(/^\/web/, '') + '/';
    },
    isFolder() {
      return this.type === "Folder";
    },
    icon() {
      if (this.isFunction || this.stat.Type === 'Function') {
        return "flash_on"; // lightning bolt
      }
      if (this.canLaunch) {
        return "web"; // web app
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
    launch() {
      console.log('Launching app', this.path);
      app.runningApp = this.launchUri;
    },
    deleteEntry() {
      const {path} = this;
      if (confirm(`Are you sure you want to PERMENENTLY DELETE ${path}`)) {
        if (confirm(`For real? ${path} should be sent to the garbage collector?`)) {
          skylink.unlink(path).then(() => {
            alert(`${path} is no more.`);
            const parent = app.selectTreeNode(path.split('/').slice(0,-1).join('/'));
            if (parent != null && parent.reload) {
              parent.reload();
            } else {
              console.warn(`no parent found for ${path}`);
            }
          }, err => {
            alert(`Sorry. I couldn't do it.`);
            console.log(err);
          });
        }
      }
    },
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
        this.loader = skylinkP.then(x => x.enumerate(this.path, {
          shapes: [
            '/rom/shapes/function',
            '/rom/shapes/web-app',
          ],
        })).then(x => {
          this.entry = x.splice(0, 1)[0];
          this.entry.Children = x.sort((a, b) => {
            var nameA = a.Name.toUpperCase();
            var nameB = b.Name.toUpperCase();
            if (nameA < nameB) { return -1; }
            if (nameA > nameB) { return 1; }
            return 0;
          });
        });
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
        skylink.store(fullPath, Skylink.Folder(this.name)).then(x => {
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
      status: '',
      input: {},
      output: null,
      inShape: {},
      outShape: {},
      outputPath: '',
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

      var input = null;
      if (this.inShape.type === 'Folder') {
        var props = [];
        this.inShape.props.forEach(prop => {
          var val = this.input[prop.name];
          if (!val) {
            if (!prop.optional) {
              alert(`Property ${prop.name} is required`);
            }
            return;
          }

          switch (prop.type) {
            case 'String':
              props.push(Skylink.String(prop.name, val));
              break;

            default:
              alert(`Property ${prop.name} is supported to be unknown type ${prop.type}`);
          }
        });
        input = Skylink.Folder('input', props);
      } else if (this.inShape.type === 'String') {
        this.input = Skylink.String('input', prompt('input:'));
      }

      this.output = null;
      this.status = 'Pending';
      skylink
        .invoke(invokePath, input, this.outputPath)
        .then(out => {
          this.status = 'Completed';
          if (!out) {
            this.output = null;
          } else if (out.Type === 'String') {
            this.output = out.StringValue;
          } else {
            this.output = JSON.stringify(out);
          }
        }, err => {
          this.status = 'Crashed';
        });
        //.then(x => console.log('invocation got', x));
    },
  },
  created() {
    skylink.fetchShape(this.tab.path + '/input-shape')
    .then(shape => {
      this.inShape = shape;
      this.props = shape.props;
    });

    skylink.fetchShape(this.tab.path + '/output-shape')
    .then(shape => {
      this.outShape = shape;
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

        // take viewport notes
        const cursor = this.editor.getCursor();
        const scrollerEl = this.editor.getScrollerElement();
        const { scrollTop } = scrollerEl;

        // do the update
        this.editor.setValue(source);

        // reset viewport
        scrollerEl.scrollTop = scrollTop;
        setTimeout(() => {
          scrollerEl.scrollTop = scrollTop;
        }, 1);

        this.editor.setCursor(cursor);
        console.log('Updated buffer to cleaned version of source');
      }

      skylink.putFile(this.tab.path, source).then(x => {
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

    focus() {
      this.editor.focus();
    },
  },

  created() {
    this.onChange = debounce(this.onChange, 250);

    if (!this.tab.isNew) {
      skylink
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
      skylink.putString(this.tab.path, this.value).then(x => {
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
      skylink
        .loadString(this.tab.path)
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
    chartName: chartName,
    roots: roots,
    tabList: [],
    tabKeys: {},
    currentTab: null,
    runningApp: null,
  },
  created() {
    window.addEventListener('keydown', this.handleKeyDown);
  },
  destroyed() {
    window.removeEventListener('keydown', this.handleKeyDown);
  },
  methods: {

    reloadApp() {
      this.$refs.appframe.contentWindow.location.reload();
    },
    navigateBack() {
      this.$refs.appframe.contentWindow.history.back();
    },
    navigateFwd() {
      this.$refs.appframe.contentWindow.history.forward();
    },
    closeApp() {
      this.runningApp = null;
    },

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
      // TODO: delay closing untouched tabs until another is opened
      if (tab && this.currentTab && this.currentTab !== tab && this.currentTab.untouched) {
        console.log('Closing untouched blurred tab', this.currentTab.key);
        this.closeTab(this.currentTab);
      }

      console.log("Switching to tab", tab.label);
      this.currentTab = tab;

      setTimeout(() => {
        var tabElem;
        if (this.currentTab && this.$refs.tabElems) {
          tabElem = this.$refs.tabElems
            .find(elem => (elem.tab||{}).key === this.currentTab.key);
        }

        if (tabElem && tabElem.focus) {
          console.log('focusing new tab', tabElem.label);
          tabElem.focus();
        }
      }, 1);
    },

    closeTab(tab) {
      // confirm first
      if (tab.dirty) {
        if (!confirm(`Close dirty tab ${tab.key}?`)) {
          return;
        }
      }

      // discover index of tab
      const idx = this.tabList.indexOf(tab);
      console.log("Closing tab", tab.label, "idx", idx);
      if (idx !== -1) {

        // close out the tab
        this.tabList.splice(idx, 1);
        delete this.tabKeys[tab.key];

        // if the tab was selected, clear it out
        if (this.currentTab === tab) {
          this.currentTab = null;

          // and select a replacement tab, if any...
          const newIdx = Math.min(idx, this.tabList.length-1);
          if (newIdx !== -1) {
            this.activateTab(this.tabList[newIdx]);
          }
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
        evt.preventDefault();
        this.offsetTabIdx(tab.tab, -1);
        break;
      case evt.code === 'Period' && evt.ctrlKey:
      case evt.code === 'BracketRight' && evt.metaKey:
        evt.preventDefault();
        this.offsetTabIdx(tab.tab, 1);
        break;

      case evt.code === 'KeyS' && (evt.metaKey || evt.ctrlKey):
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

      case evt.code === 'KeyN' && (evt.metaKey || evt.ctrlKey):
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
        console.log('key', evt.code, evt.metaKey, evt.ctrlKey);

      }
    },
  },

});

// Block navs unless everything is clean
window.onbeforeunload = () =>
  app.tabList.find(x => x.dirty) || null;
