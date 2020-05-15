CURRENT_LOADER.attachBehavior(class Route {

  gatherScripts(allScripts) {
    if (this.Action.Script) {
      allScripts.push(this.Action.Script);
    }
  }

});
