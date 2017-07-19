var skylink;
const skylinkP = Skylink
  .openChart()
  .then(x => new Skylink('/state/app-data/todo-list', x))
  .then(x => skylink = x)
  .then(() => skylink.mkdirp('/records'))
  .then(() => skylink.mkdirp('/todo'))
  .then(() => skylink);

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
      skylink.putString(`/done/${this.id}`, this.id)
        .then(() => skylink.unlink(`/todo/${this.id}`))
        .then(() => skylink.putString(`/records/${this.id}/completed-at`, new Date().toISOString()))
        .then(() => app.load());
    },
  },
  created() {
    skylink
      .loadString(`/records/${this.id}/text`)
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
      skylink.storeRandom('/records', {
        text:       this.text,
        'added-at': new Date().toISOString(),
      }).then(id => {
        console.log('Created todo', id);
        this.text = '';
        return skylink.putString(`/todo/${id}`, id)
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
      skylink.enumerate('/todo', {
        includeRoot: false,
      }).then(children => {
        this.list = children.map(x => x.Name);
      });
    },
  },
  created() {
    skylinkP.then(() => this.load());
  },
});
