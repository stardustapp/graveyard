// cache supports recursive purposes
const TypeCache = new Map;

// Primitives
const builtinTypes = new Set;
builtinTypes.add(String);
//builtinTypes.add(Blob);
builtinTypes.add(Date);
builtinTypes.add(Number);
builtinTypes.add(Boolean);

CURRENT_LOADER.attachLifecycle(class Lifecycle {

  constructFrom(input) {
    //const builder = this._newNamedObject('Builder', {
    const typeResolver = rawConfig => this
      ._callLifecycle('constructFrom', rawConfig);
    //const typeResolver = this.constructFrom.bind(this);

    if (TypeCache.has(input))
      return TypeCache.get(input);

    // support a shorthand for the JS-native primitives
    const config = builtinTypes.has(input)
      ? {type: input} : input;

    const pending = this._newNamedObject('Pending', input);
    TypeCache.set(input, pending);

    let type = '';
    switch (true) {
      case !['object', 'functionTODO'].includes(typeof config):
        throw new Error(`Unrecognized type value type ${typeof config}`)
      // case FieldType.prototype.isPrototypeOf(config.type):
      //   type = config.type;
      //   break;
      case config.type === JSON:
        type = this._newNamedObject('Unstructured', {config});
        break;
      case builtinTypes.has(config.type):
        // TODO: 'choices'
        type = this._newNamedObject('Primitive', {config});
        break;
      case 'reference' in config:
        type = this._newNamedObject('Reference', {config, typeResolver});
        break;
      case 'anyOfKeyed' in config:
        type = this._newNamedObject('AnyOfKeyed', {config, typeResolver});
        break;
      case 'fields' in config:
        type = this._newNamedObject('Struct', {config, typeResolver});
        break;
      default:
        console.warn(config);
        throw new Error(`Unrecognized field type for ${JSON.stringify(config.type)}`);
    }

    // opt-in for wrapping with extra single-slot types
    if ('isList' in config && config.isList) {
      type = this._newNamedObject('List', {config, type});
    }
    if ('optional' in config && config.optional) {
      type = this._newNamedObject('Optional', {config, type});
    }

    pending.final = type;
    TypeCache.set(input, type);

    return type;
  }

});
