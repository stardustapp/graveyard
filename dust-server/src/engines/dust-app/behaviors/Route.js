GraphEngine.attachBehavior('dust-app/v1-beta1', 'Route', {

  gatherScripts(allScripts) {
    if (this.Action.Script) {
      allScripts.push(this.Action.Script);
    }
  },

});
