// exports.DriverBase = class DriverBase {
//   constructor(loadApi) {
//     console.log('making DriverBase from', loadApi);
//     this.baseApi = loadApi;
//   }
//
//   newNamedObject(name, data=null) {
//     const object = data || Object.create(null);
//     this.baseApi._attachBehavior(name, object);
//     return object;
//   }
//
//   newDriver(loadApi) {
//     console.log('DriverBase constructing from', loadApi);
//
//     const schemaBuilder = this.newNamedObject('Schema');
//
//     throw new Error('TODO DriverBase');
//   }
// }
