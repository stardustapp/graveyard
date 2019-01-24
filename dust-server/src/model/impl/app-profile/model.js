new GraphEngineBuilder('app-profile/v1-beta1', build => {

  build.node('Instance', {
    treeRole: 'root',
    fields: {

    },
  });

  build.node('Handle', {
    treeRole: 'leaf',
    fields: {
      
    },
  });

  build.node('Database', {
    treeRole: 'leaf',
    fields: {
      
    },
  });

}).install();
