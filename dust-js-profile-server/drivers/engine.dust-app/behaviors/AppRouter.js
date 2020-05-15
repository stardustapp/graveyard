CURRENT_LOADER.attachBehavior(class AppRouter {

  async gatherScripts(allScripts) {
    for (const Route of await this.RouteTable.fetchAll()) {
      Route.gatherScripts(allScripts);
    }
  }

});
