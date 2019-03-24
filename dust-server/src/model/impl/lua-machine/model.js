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
    relations: [
      { predicate: 'TOP', exactly: 1 },
      { predicate: 'OPERATES', object: 'Daemon' },
      { predicate: 'HAS_NAME', object: 'Function', uniqueBy: 'Name' },
    ],
    fields: {
      TreeUri: String,
    },
  });

  build.node('Daemon', {
    relations: [
      { exactly: 1, subject: 'Instance', predicate: 'OPERATES' },
    ],
    fields: {
      SourceText: String,
    },
  });

  build.node('Function', {
    relations: [
      { subject: 'Instance', predicate: 'HAS_NAME' },
    ],
    fields: {
      Name: String,
      SourceText: String,
    },
  });

}).install();
