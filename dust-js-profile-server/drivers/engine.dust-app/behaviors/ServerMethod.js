CURRENT_LOADER.attachBehavior(class ServerMethod {

  gatherScripts(allScripts) {
    allScripts.push(this);
  }

  async invoke(argument) {
    await eval(this.JS).call({
      get() {
        return function(){};
      },
    }).call().call(null, argument);
  }

});
