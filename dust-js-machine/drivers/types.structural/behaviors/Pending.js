CURRENT_LOADER.attachBehavior(class Pending {
  setup(source) {
    this.source = source;
    this.final = null;
  }

  fromExt(input) {
    // TODO: best way of doing this?
    if (this.final) {
      return this.final.fromExt(input);
    }
    throw new FieldTypeError(this,
      `Still pending`);
  }
});
