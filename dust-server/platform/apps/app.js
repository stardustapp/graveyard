const orbiter = new Orbiter("/n/aws-ns/data/todo-list");

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
      orbiter
        .delete(`/todo/${this.id}`)
        .then(x => app.load());
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
        added: Orbiter.String(new Date().toISOString()),
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
