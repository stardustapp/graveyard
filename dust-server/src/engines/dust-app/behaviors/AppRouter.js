GraphEngine.attachBehavior('dust-app/v1-beta1', 'AppRouter', {

  async gatherScripts(allScripts) {
    for (const Route of await this.RouteTable.fetchAll()) {
      Route.gatherScripts(allScripts);
    }
  },

});
