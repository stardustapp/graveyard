class PrimitiveFieldType extends FieldType {
  constructor(rawConf, jsConstr, serialize, extConstr, parse) {
    super('core', jsConstr.name);
    this.rawConf = rawConf;
    this.jsConstr = jsConstr;
    this.extConstr = extConstr || jsConstr;
    this.parse = parse || jsConstr;
    this.serialize = serialize || jsConstr;
  }
  fromExt(input) {
    if (input == null) throw new FieldTypeError(this,
      `Builtin primitives cannot be null`);
    if (input.constructor !== this.extConstr) throw new FieldTypeError(this,
      `Was given ${input.constructor.name}, not ${this.extConstr.name}`);
    return this.parse(input);
  }
  toExt(input) {
    return this.serialize(input);
  }
}
builtinTypes.set(String, rawConf => new PrimitiveFieldType(rawConf, String));
if (self.Blob) builtinTypes.set(Blob, rawConf => new PrimitiveFieldType(rawConf, Blob));
builtinTypes.set(Date, rawConf => new PrimitiveFieldType(rawConf, Date, d => d.toISOString(), String, x => new Date(x)));
builtinTypes.set(Number, rawConf => new PrimitiveFieldType(rawConf, Number));
builtinTypes.set(Boolean, rawConf => new PrimitiveFieldType(rawConf, Boolean));

class PrimitiveAccessor extends FieldAccessor {
  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error(
      `PrimitiveAccessor#mapOut() got null`);
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    if (value == null) {
      if (this.myType.rawConf.defaultValue != null) {
        return this.myType.toExt(this.myType.rawConf.defaultValue);
      }
      throw new Error('PrimitiveAccessor#mapIn() got null '+this.myType.name);
    }
    return this.myType.toExt(value);
  }
  exportData(node, opts) {
    return node;
  }
}

accessorConstructors.set(PrimitiveFieldType, PrimitiveAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    PrimitiveFieldType,
    PrimitiveAccessor,
  };
}
