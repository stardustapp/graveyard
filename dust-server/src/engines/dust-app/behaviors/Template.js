GraphEngine.attachBehavior('dust-app/v1-beta1', 'Template', {

  gatherScripts(allScripts) {
    for (const Script of this.Scripts) {
      allScripts.push(Script);
    }
  },

});
