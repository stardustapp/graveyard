//const {ExtendableError} = require('../utils/errors.js');
class FieldTypeError extends Error {
  constructor(type, message) {
    super(`Type ${type.constructor.name} bailed: ${message}`)
    this.path = [];
  }
}

CURRENT_LOADER.attachModel(build => {

});
