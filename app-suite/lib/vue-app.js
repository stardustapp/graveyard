window.orbiter = new Orbiter();
var promise = orbiter.autoLaunch()
  .then(() => {
    window.skylink = orbiter.mountTable.api;
    return window.skylink;
  }, err => {
    alert(`Couldn't open chart. Server said: ${err}`);
    throw err;
  });
window.skylinkP = promise;

Vue.component('sky-session', {
  data: () => ({
    orbiter: orbiter,
    launcher: orbiter.launcher,
    stats: {},
  }),
  created() {
    promise.then(() => this.stats = orbiter.skylink.stats);
  },
  template: `
  <div class="sky-session">
    <div :class="'indicator status-'+orbiter.status" />
    {{orbiter.status}} &mdash;&nbsp;
    <span class="chart">{{launcher.chartName}}</span><!--@{{launcher.domainName}}-->/{{launcher.appId}}
    <div class="filler" />
    <!--{{sess.ownerName}} | {{sess.uri}}-->
      {{stats.ops}}o
      {{stats.chans}}c
      {{stats.pkts}}p
      {{stats.fails}}f
  </div>`,
});

Vue.component('sky-form', {
  props: {
    action: String,
    path: String,
  },
  data() { return {
    status: 'Ready',
  }},
  methods: {
    submit(evt) {
      if (this.action != 'store-child-folder') {
        alert('invalid form action '+this.action);
        throw new Error('invalid form action');
      }

      // check for double-submit racing
      if (this.status == 'Pending') {
        console.warn('rejecting concurrent submission in sky-form');
        return;
      }

      this.status = 'Pending';
      // construct body to submit
      const {form} = this.$refs;
      const elems = [].slice.call(form.elements);
      const input = {};
      elems.forEach(el => {
        if (el.name) {
          input[el.name] = el.value;
        }
      });

      const setReadonly = (value) =>
        elems.forEach(el => {
          if (el.localName === 'input' && el.type !== 'checkbox') {
            el.readOnly = value;
          } else {
            el.disabled = value;
          }
        });

      switch (this.action) {

        case 'store-child-folder':
          setReadonly(true);
          console.log('submitting', input, 'to', '/'+this.path);
          promise.then(skylink => {
            skylink.mkdirp('/'+this.path)
              .then(() => skylink.storeRandom('/'+this.path, input))
              .then((id) => {
                setReadonly(false);
                evt.target.reset();
                this.status = 'Ready';
              }, (err) => {
                setReadonly(false);
                this.status = 'Failed';
                 throw err;
              });
          });
          break;

        case 'invoke-with-folder':
          setReadonly(true);
          console.log('submitting', input, 'to', '/'+this.path);
          promise.then(skylink => {
            skylink.invoke('/'+this.path, input)
              .then((id) => {
                setReadonly(false);
                evt.target.reset();
                this.status = 'Ready';
              }, (err) => {
                setReadonly(false);
                this.status = 'Failed';
                throw err;
              });
          });
          break;

        default:
          alert('bad sky-form action ' + this.action);
      }
    },
  },
  template: `<form ref="form" :class="'sky-form status-'+this.status" @submit.prevent="submit"><slot/></form>`,
});

Vue.component('sky-datetime-field', {
  props: {
    name: String,
    type: String,
  },
  computed: {
    value() {
      switch (this.type) {
        case 'current-timestamp':
          return new Date().toISOString();
        default:
          alert('bad sky-datetime-field type '+this.type);
          return null;
      }
    },
  },
  template: '<input type="hidden" :name="name" :value="value" />',
});

Vue.component('sky-foreach', {
  props: {
    path: String,
    el: String,
    filter: Object,
    fields: String,
    depth: Number,
  },
  data: () => ({
    items: [],
    stats: {},
    nonce: null,
  }),
  watch: {
    path(path) { this.switchTo(path) },
  },
  created() { this.switchTo(this.path) },
  destroyed() {
    if (this.sub) {
      this.sub.stop();
    }
  },
  methods: {
    switchTo(path) {
      if (this.sub) {
        this.sub.stop();
      }

      // TODO: fetch subs from cache
      console.log('updating sky-foreach to', path);
      this.items = [];
      const nonce = ++this.nonce;

      promise
        .then(skylink => skylink.subscribe('/'+this.path, {maxDepth: this.depth+1}))
        .then(chan => {
          if (this.nonce !== nonce) {
            console.warn('sky-foreach sub on', path, 'became ready, but was cancelled, ignoring');
            return;
          }
          this.nonce = null;

          const sub = new RecordSubscription(chan, {
            basePath: this.path,
            filter: this.filter,
            fields: this.fields.split(' '),
          });
          console.log('sky-foreach sub started');
          this.sub = sub;
          this.items = sub.items;
          this.stats = sub.stats;
        });
    },
  },
  template: `
  <component :is="el||'div'">
    <slot name="header"></slot>
    <slot v-for="item in items" name="item" v-bind="item"></slot>
    <slot v-if="stats.hidden" name="hiddenNotice" :count="stats.hidden"></slot>
  </component>`,
});

Vue.component('sky-action-checkbox', {
  props: {
    path: String,
    checkedValue: String,
  },
  methods: {
    onChange(evt) {
      const {checked} = evt.target;
      if (checked && this.checkedValue) {
        promise.then(x => x.putString('/'+this.path, this.checkedValue));
      }
    },
  },
  template: '<input type="checkbox" @click="onChange" />',
});

/*
Vue.component('sky-show', {
  props: {
    path: String,
  },
  template: '<div>{{path}}</div>',
});
*/

Vue.component('sky-with', {
  props: {
    path: String,
    el: String,
  },
  data: () => ({
    item: null,
    nonce: null,
  }),
  watch: {
    path(path) { this.switchTo(path) },
  },
  created() { this.switchTo(this.path) },
  destroyed() {
    if (this.sub) {
      this.sub.stop();
    }
  },
  methods: {
    switchTo(path) {
      if (this.sub) {
        this.sub.stop();
      }

      // TODO: fetch subs from cache
      console.log('updating sky-with to', path);
      this.item = null;
      const nonce = ++this.nonce;

      promise
        .then(skylink => skylink.subscribe('/'+path, {maxDepth: 1}))
        .then(chan => {
          const sub = new FlatSubscription(chan);
          this.sub = sub;
          return sub.readyPromise;
        })
        .then(fields => {
          if (this.nonce === nonce) {
            this.item = fields;
            this.nonce = null;
          } else {
            console.warn('sky-with sub on', path, 'became ready, but was cancelled, ignoring');
          }
        });
    },
  },
  template: `
  <component :is="el||'div'">
    <slot v-bind="item"></slot>
  </component>`,
});

Vue.mixin({
  methods: {
    skyStoreString(path, value) {
      return promise.then(x => x.putString('/'+path, value));
    },

    // TODO: the sidebar should handle this itself probably, close-on-navigate
    closeNav(evt) {
      const {classList} = document.querySelector('#left-menu');
      if (classList.contains('open')) {
        classList.add('animate');
        classList.remove('open');
      }
    },
  }
});

var router;
if (window.appRouter) {
  router = appRouter;
} else if (window.VueRouter) {
  console.warn(`Creating blank vue router`);
  router = new VueRouter({
    mode: 'hash',
    routes: [
      //{ name: 'context', path: '/network/:network/context/:type/:context', component: ViewContext },
    ],
  });
}

var app = new Vue({
  el: '#app',
  router,
  data: {
    dataPath: '/persist',
    prefs: {},
  },
  methods: {
  },
  mounted () {
    // apply userstyle.css from persist/<app>/prefs/
    let style = document.createElement('style');
    style.type = 'text/css';
    style.appendChild(document.createTextNode(''));
    document.head.appendChild(style);
    promise.then(() => {
      skylink.loadFile(`/config/${orbiter.launcher.appId}/prefs/userstyle.css`)
        .then(x => style.childNodes[0].textContent = x);
    });
  },
  created() {
    // TODO: i think something else sets this later
    window.app = this;

    promise.then(() => {
      skylink.subscribe(`/config/${orbiter.launcher.appId}/prefs`, {
        maxDepth: 1,
      }).then(chan => {
        const prefChan = chan.channel.map(ent => {
          if (ent.path) {
            ent.path = ent.path.replace(/-(.)/g, (_, char) => char.toUpperCase());
          }
          return ent;
        });
        const sub = new FlatSubscription({
          channel: prefChan,
          stop: chan.stop.bind(chan),
        }, this);
        this.prefSub = sub;
        return sub.readyPromise;
      }).then(prefs => {
        this.prefs = prefs;
      });
    });
  },
});

// provide helper to set a temp pref
window.setPref = (prefName, value) => {
  app.$set(app.prefs, prefName, value || '');
};