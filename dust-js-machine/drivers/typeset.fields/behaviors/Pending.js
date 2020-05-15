CURRENT_LOADER.attachBehavior(class Pending {
  build(source) {
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

  accept(element, visitor) {
    // TODO: best way of doing this?
    if (this.final) {
      return this.final.accept(element, visitor);
    }
    throw new FieldTypeError(this,
      `Still pending`);
  }
});
