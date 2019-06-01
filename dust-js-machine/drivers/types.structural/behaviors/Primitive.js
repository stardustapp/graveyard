// basically a four-step loop
// for JSON-compat primitives,
CURRENT_LOADER.attachBehavior(class Primitive {
  setup({config}) {
    this.jsConstr = config.type;
    this.defaultValue = config.defaultValue;

    switch (this.jsConstr) {
      case Date:
        this.serializeFunc = d => d.toISOString();
        this.extConstr = String;
        this.parseFunc = x => new Date(x);
        break;
      default:
        this.serializeFunc = this.jsConstr;
        this.extConstr = this.jsConstr;
        this.parseFunc = this.jsConstr;
        break;
    }
  }


  fromExt(input) {
    if (input == null) throw new FieldTypeError(this,
      `Builtin primitives cannot be null`);
    if (input.constructor !== this.extConstr) throw new FieldTypeError(this,
      `Was given ${input.constructor.name}, not ${this.extConstr.name}`);
    return this.parseFunc(input);
  }

  toExt(input) {
    return this.serializeFunc(input);
  }


  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error(
      `Primitive#mapOut() got null`);
    return this.fromExt(value);
  }

  mapIn(value, graphCtx, node) {
    if (value == null) {
      if (this.defaultValue != null) {
        return this.toExt(this.defaultValue);
      }
      throw new Error('Primitive#mapIn() got null '+this.name);
    }
    return this.toExt(value);
  }


  exportData(node, opts) {
    return node;
  }
});
