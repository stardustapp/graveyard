const orbiter = new Orbiter("/n/redis-ns/app-data/todo-list");
orbiter.mkdirp('/records');
orbiter.mkdirp('/todo');

Vue.component('todo-item', {
  template: '#todo-item',
  props: {
    id: String,
  },
  data() {
    return {
      text: '',
      created: null,
      loading: true,
    };
  },
  methods: {
    done() {
      orbiter.putString(`/done/${this.id}`, this.id)
        .then(() => orbiter.delete(`/todo/${this.id}`))
        .then(() => orbiter.putString(`/records/${this.id}/completed-at`, new Date().toISOString()))
        .then(() => app.load());
    },
  },
  created() {
    orbiter
      .loadFile(`/records/${this.id}/text`)
      .then(x => {
        this.text = x;
        this.loading = false;
      });
  },
});

Vue.component('add-todo', {
  template: '#add-todo',
  data() {
    return {
      text: '',
    };
  },
  methods: {
    save() {
      orbiter.putRandomFolder('/records', {
        text: Orbiter.String(this.text),
        'added-at': Orbiter.String(new Date().toISOString()),
      }).then(id => {
        console.log('Created todo', id);
        this.text = '';
        return orbiter.putString(`/todo/${id}`, id)
      }).then(() => app.load());
    },
  },
});

var app = new Vue({
  el: '#app',
  data: {
    list: [],
  },
  methods: {
    load() {
      orbiter.loadMetadata('/todo').then(res => {
        this.list = res.children.map(x => x.name);
      });
    },
  },
  created() {
    this.load();
  },
});
