CURRENT_LOADER.attachBehavior(class Template {

  gatherScripts(allScripts) {
    for (const Script of this.Scripts) {
      allScripts.push(Script);
    }
  }

});
