CURRENT_LOADER.attachBehavior(class Unstructured {
  setup({config}) {
    //this.rawConf = rawConf;
  }

  fromExt(input) {
    if (input == null) throw new FieldTypeError(this,
      `Unstructured primitives cannot be null`);
    if (input.constructor === String) return JSON.parse(input);
    throw new FieldTypeError(this,
      `Was given ${input.constructor.name}, not String`);

  }
  toExt(input) {
    return JSON.stringify(input);
  }

  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error('Unstructured#mapOut() got null');
    return this.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    if (value == null) throw new Error('Unstructured#mapIn() got null');
    return this.toExt(value);
  }

  exportData(node, opts) {
    throw new Error(`TODO UNSTRUCT`)
    return this.structType.exportData(node, opts);
  }
});
