/*
 * Lua runtime presenting blueprint-based 'machines'
 * A machine is created by combining a tree reference with various processors
 * Each processor instance has its own isolated Lua state
 * Processors have access to ad-hoc non-isolated threading
 * Processor state is not persistent -
 *   all the Lua will 'reboot' from scratch when Stardust loads up
 */

new GraphEngineBuilder('lua-machine/v1-beta1', build => {

  build.node('Instance', {
    treeRole: 'root',
    fields: {
      TreeUri: String,
    },
  });

  build.node('Daemon', {
    treeRole: 'leaf',
    fields: {
      SourceText: String,
    },
  });

  build.node('Function', {
    treeRole: 'leaf',
    fields: {
      SourceText: String,
    },
  });

}).install();
