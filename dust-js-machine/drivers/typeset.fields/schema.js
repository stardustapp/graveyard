//const {ExtendableError} = require('../utils/errors.js');
class FieldTypeError extends Error {
  constructor(type, message) {
    super(`Type ${type.constructor.name} bailed: ${message}`)
    this.path = [];
  }
}

// cache supports recursive purposes
const TypeCache = new Map;

// Primitives
const builtinTypes = new Set;
builtinTypes.add(String);
//builtinTypes.add(Blob);
builtinTypes.add(Date);
builtinTypes.add(Number);
builtinTypes.add(Boolean);

CURRENT_LOADER.attachModel(build => {

  build.nameInterface('FieldType', {
  })

  build.nameDataType('AnyOfKeyed', { bases: ['FieldType'] });
  build.nameDataType('List', { bases: ['FieldType'] });
  build.nameDataType('Optional', { bases: ['FieldType'] });
  build.nameDataType('Pending', { bases: ['FieldType'] });
  build.nameDataType('Primitive', { bases: ['FieldType'] });
  build.nameDataType('Reference', { bases: ['FieldType'] });
  build.nameDataType('Struct', { bases: ['FieldType'], methods: {
    makeDataType: { input: 'base.base/String' },
  }});
  build.nameDataType('Unstructured', { bases: ['FieldType'] });

  build.nameFunction('ReadSignature', {
    input: 'base.base/NativeJsObject',
    self: 'base.base/EntityProvider',
    output: 'FieldType',
    impl(input) {
      console.log('fields reading', input, this);


      //const builder = this.invokeEntity('Builder', {
      const typeResolver = rawConfig => this
        ._callLifecycle('constructFrom', rawConfig);
      //const typeResolver = this.constructFrom.bind(this);

      if (TypeCache.has(input))
        return TypeCache.get(input);

      // support a shorthand for the JS-native primitives
      const config = builtinTypes.has(input)
        ? {type: input} : input;

      const pending = this.invokeEntity('Pending', input);
      TypeCache.set(input, pending);

      let type = '';
      switch (true) {
        case !['object', 'functionTODO'].includes(typeof config):
          throw new Error(`Unrecognized type value type ${typeof config}`)
        // case FieldType.prototype.isPrototypeOf(config.type):
        //   type = config.type;
        //   break;
        case config.type === JSON:
          type = this.invokeEntity('Unstructured', {config});
          break;
        case builtinTypes.has(config.type):
          // TODO: 'choices'
          type = this.invokeEntity('Primitive', {config});
          break;
        case 'reference' in config:
          type = this.invokeEntity('Reference', {config, typeResolver});
          break;
        case 'anyOfKeyed' in config:
          type = this.invokeEntity('AnyOfKeyed', {config, typeResolver});
          break;
        case 'fields' in config:
          type = this.invokeEntity('Struct', {config, typeResolver});
          break;
        default:
          console.warn(config);
          throw new Error(`Unrecognized field type for ${JSON.stringify(config.type)}`);
      }

      // opt-in for wrapping with extra single-slot types
      if ('isList' in config && config.isList) {
        type = this.invokeEntity('List', {config, type});
      }
      if ('optional' in config && config.optional) {
        type = this.invokeEntity('Optional', {config, type});
      }

      pending.final = type;
      TypeCache.set(input, type);

      return type;
    }});

});
