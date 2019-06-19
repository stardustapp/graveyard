CURRENT_LOADER.attachBehavior(class Optional {
  build({config, type}) {
    this.inner = type;
  }


  fromExt(input) {
    if (input == null) return null;
    return this.inner.fromExt(input);
  }


  mapOut(rawVal, graphCtx, node) {
    let innerVal;
    if (rawVal === undefined || rawVal === null)
      return null;
    else {
      return this.inner.mapOut(rawVal, graphCtx, node);
    }
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal === undefined || newVal === null)
      return null;
    return this.inner.mapIn(newVal, graphCtx, node);
  }


  // intended as general-purpose replacement for ex. gatherRefs
  accept(element, visitor) {
    visitor.visit(this, element);
    if (element !== undefined && element !== null)
      this.inner.accept(element, visitor);
  }
  // TODO: remove
  gatherRefs(rawVal, refs) {
    if (rawVal === undefined || rawVal === null)
      return;
    if ('gatherRefs' in this.inner)
      this.inner.gatherRefs(rawVal, refs);
  }

  exportData(rawVal, opts) {
    if (rawVal === undefined || rawVal === null)
      return;
    return this.inner.exportData(rawVal, opts);
  }
});
