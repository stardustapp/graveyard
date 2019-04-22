GraphEngine.attachBehavior('dust-app/v1-beta1', 'ServerMethod', {

  gatherScripts(allScripts) {
    allScripts.push(this);
  },

  async invoke(argument) {
    await eval(this.JS).call({
      get() {
        return function(){};
      },
    }).call().call(null, argument);
  },

});
