
class OptionalFieldType extends FieldType {
  constructor(config, inner) {
    super('composite', 'Optional');
    this.inner = inner;
  }
  fromExt(input) {
    if (input == null) return null;
    return this.inner.fromExt(input);
  }
}


class OptionalAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.innerAccessor = FieldAccessor.forType(type.inner);
  }

  mapOut(rawVal, graphCtx, node) {
    let innerVal;
    if (rawVal === undefined || rawVal === null)
      return null;
    else {
      return this.innerAccessor.mapOut(rawVal, graphCtx, node);
    }
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal === undefined || newVal === null)
      return null;
    return this.innerAccessor.mapIn(newVal, graphCtx, node);
  }

  gatherRefs(rawVal, refs) {
    if (rawVal === undefined || rawVal === null)
      return;
    if ('gatherRefs' in this.innerAccessor)
      this.innerAccessor.gatherRefs(rawVal, refs);
  }
}

accessorConstructors.set(OptionalFieldType, OptionalAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    OptionalFieldType,
    OptionalAccessor,
  };
}
