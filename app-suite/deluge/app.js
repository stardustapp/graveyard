Vue.component('torrent-list', {
  template: '#torrent-list',
  props: {

  },
  data: () => ({
    torrents: [],
  }),
  methods: {
    updateList() {
      skylink.invoke('/drivers/deluge-client/sessions/TODO/get-torrents/invoke').then(x => {
        this.torrents = x.Children.map(y => {
          const obj = {};
          y.Children.forEach(z => {
            obj[z.Name.replace(/-([a-z])/g, ([_, char]) => char.toUpperCase())] = z.StringValue;
          });
          if (obj.savePath) {
            const pathMatch = obj.savePath.match(/\/~([^\/]+)/);
            if (pathMatch) {
              obj.user = pathMatch[1];
            }
          }
          return obj;
        }).filter(x => x.user === orbiter.launcher.chartName);
      });
    },
  },

  created() {
    this.timer = setInterval(this.updateList.bind(this), 15000);
    setTimeout(() => this.updateList(), 1000);
  },
  destroyed() {
    clearInterval(this.timer);
  },
});

Vue.component('torrent-entry', {
  template: '#torrent-entry',
  props: {
    data: {},
  },
});
