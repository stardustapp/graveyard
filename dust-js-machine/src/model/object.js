exports.GraphObject = class GraphObject {
  constructor(type, data) {
    this.type = type;
    this.data = data;
    //console.log('created GraphObject', data, type);

    for (const [key, fieldType] of type.inner.fields.entries()) {
      Object.defineProperty(this, key, {
        get() { return data[key]; }, // TODO
        //set(newValue) { bValue = newValue; },
        enumerable: true,
        configurable: true
      });
    }
  }
}
