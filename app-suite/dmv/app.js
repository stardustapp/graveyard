const orbiter = new Orbiter('/n/aws-ns/native-drivers');

var app = new Vue({
  el: '#app',
  data: {
    driverList: [],
  },
  created() {
    orbiter.loadMetadata('').then(entry => {
      this.driverList = entry.children
        .filter(x => x.type === 'Folder')
        .map(x => x.name);
    });
  },
});
