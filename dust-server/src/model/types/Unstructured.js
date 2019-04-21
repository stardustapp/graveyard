
class UnstructuredFieldType extends FieldType {
  constructor() {
    super('core', 'JSON');
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
}
builtinTypes.set(JSON, new UnstructuredFieldType());

class UnstructuredAccessor extends FieldAccessor {
  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error('UnstructuredAccessor#mapOut() got null');
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    if (value == null) throw new Error('UnstructuredAccessor#mapIn() got null '+this.myType.default);
    return this.myType.toExt(value);
  }
}

accessorConstructors.set(UnstructuredFieldType, PrimitiveAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    UnstructuredFieldType,
    UnstructuredAccessor,
  };
}
