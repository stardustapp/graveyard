GraphEngine.attachBehavior('dust-app/v1-beta1', 'ServerMethod', {

  gatherScripts(allScripts) {
    allScripts.push(this);
  },

});
