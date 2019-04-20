GraphEngine.attachBehavior('dust-app/v1-beta1', 'Package', {

  // compile all the references made in scripts
  async linkScripts() {

    // load resource dictionary
    const resByNames = new Map;
    for (const resource of await this.HAS_NAME.fetchAllObjects()) {
      resByNames.set(resource.Name, resource);
      // TODO: if dep, scrape the other pkg's reses too
    }
    function getByName(name) {
      // TODO: support more complex paths
      if (resByNames.has(name))
        return resByNames.get(name);
      throw new Error(
        `Script injected unresolved resource '${name}'`);
    }

    // gather all scripts
    const allScripts = new Array;
    for (const resource of resByNames.values()) {
      if ('gatherScripts' in resource)
        await resource.gatherScripts(allScripts);
    }

    console.log(`Package '${this.PackageKey}'`,
      'is linking', allScripts.length, 'scripts');
    for (const Script of allScripts) {
      Script.Refs = getScriptRefs(Script.Source, getByName);
    }
  }

});

// TODO: move to a 'script' node
function getScriptRefs(Source, resolveRef) {
  const refs = new Set;
  const dirRegex = /^( *)%([a-z]+)(?: (.+))?$/img;
  Source.Coffee.replace(dirRegex, function (_, ws, dir, args) {
    switch (dir.toLowerCase()) {
      case 'inject':
        return args.split(',').map(arg => {
          // TODO: validate name syntax regex!
          refs.add(arg.trim())
          return `${ws}${arg} = DUST.get ${JSON.stringify(arg)}`;
        }).join('\n');
      default:
        throw new Error(`invalid-directive: '${dir}' is not a valid DustScript directive`);
    }
  });
  return Array.from(refs).map(resolveRef);
}
