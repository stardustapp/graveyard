new GraphEngine('app-profile/v1-beta1', {
  objectTypes: {

    Instance: {
      isGraphRoot: true,
      implementation: class AppProfileInstance extends GraphObject {}
    },

    Handle: {
      implementation: class AppProfileHandle extends GraphObject {}
    },

    Database: {
      implementation: class AppProfileDatabase extends GraphObject {}
    },

  }
});
