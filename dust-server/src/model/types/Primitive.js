class PrimitiveFieldType extends FieldType {
  constructor(name, jsConstr, serialize, extConstr, parse) {
    super('core', name);
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
builtinTypes.set(String, new PrimitiveFieldType('String', String));
if (self.Blob) builtinTypes.set(Blob, new PrimitiveFieldType('Blob', Blob));
builtinTypes.set(Date, new PrimitiveFieldType('Date', Date, d => d.toISOString(), String, x => new Date(x)));
builtinTypes.set(Number, new PrimitiveFieldType('Number', Number));
builtinTypes.set(Boolean, new PrimitiveFieldType('Boolean', Boolean));

class PrimitiveAccessor extends FieldAccessor {
  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error('PrimitiveAccessor#mapOut() got null');
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    if (value == null) throw new Error('PrimitiveAccessor#mapIn() got null '+this.myType.default);
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
