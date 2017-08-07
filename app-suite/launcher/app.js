const skylinkP = Skylink.openChart();
var skylink = null;
skylinkP.then(x => skylink = x);

Vue.component('launcher-tab', {
  template: '#launcher-tab',
  props: {
    tab: Object,
  },
  data() {
    return {
      recentApps: [],
      otherApps: [],
    };
  },
  created() {
    this.recentApps.push({
      key: 'designer',
      iconUrl: 'https://i.imgur.com/xuay4UD.png',
      frameUri: '/~system/designer/',
      label: 'App Designer',
      type: 'iframe-tab',
    });
    this.recentApps.push({
      key: 'irc',
      iconUrl: 'https://i.imgur.com/HGd2i3h.png',
      frameUri: '../irc/',
      label: 'IRC',
      type: 'iframe-tab',
    });
    this.recentApps.push({
      key: 'editor',
      iconUrl: 'https://i.imgur.com/pMwIrq5.png',
      frameUri: '/~system/editor/?chart=' + skylinkP.chartName,
      label: 'Editor',
      type: 'iframe-tab',
    });
    this.recentApps.push({
      key: 'todo',
      iconUrl: 'https://i.imgur.com/jPh4xwk.png',
      frameUri: '../todo-list/',
      label: 'ToDONE',
      type: 'iframe-tab',
    });

    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/bm36BUr.png',
      label: 'Readit',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/lpZf5bq.png',
      label: 'Plex Player',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/FmKehLV.png',
      label: 'System Tools',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/7LjmDwH.png',
      label: 'Space Invasion',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/KdtZaF1.png',
      label: 'Skychart',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/zgWbWjP.png',
      label: 'Git-r-dun',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/MHOFlig.png',
      label: 'DMV',
    });
    this.otherApps.push({
      iconUrl: 'https://i.imgur.com/Ro7qcbB.png',
      label: 'App Store',
    });
  },
  computed: {
  },
  methods: {
    activate(a) {
      app.openTab(a);
    },
  },
});

Vue.component('iframe-tab', {
  template: '#iframe-tab',
  props: {
    tab: Object,
  },
  data() {
    return {
      runningApp: this.tab.frameUri,
    };
  },
  created() {
  },
  computed: {
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

    activate(a) {
      app.openTab(a);
    },
  },
});


var app = new Vue({
  el: '#app',
  data: {
    chartName: skylinkP.chartName,
    tabList: [],
    tabKeys: {},
    currentTab: null,
    runningApp: null,
  },
  created() {
    this.openTab({
      key: 'launcher',
      type: "launcher-tab",
      icon: "apps",
      label: 'App Launcher',
    });
    this.openTab({
      key: 'editor',
      iconUrl: 'https://i.imgur.com/pMwIrq5.png',
      frameUri: '/~system/editor/?chart=' + skylinkP.chartName,
      label: 'Editor',
      type: 'iframe-tab',
    });
  },
  methods: {

    // Focus or open a new editor for given details
    openTab(deets) {
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
  },

});
