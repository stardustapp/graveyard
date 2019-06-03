CURRENT_LOADER.attachBehavior(class List {
  build({config, type}) {
    this.inner = type;
    this.defaultValue = config.defaultValue;
  }


  fromExt(input) {
    //console.log(input);
    if (!input || input.constructor !== Array) throw new FieldTypeError(this,
      `Was not given an Array`);
    return input.map(x => this.inner.fromExt(x));
  }


  mapOut(rawVal, graphCtx, node) {
    const array = rawVal || [];
    const innerType = this.inner;
    const proxy = new Proxy(array, {
      get(target, prop, receiver) {
        switch (prop) {

          case 'length':
            return rawVal.length;

          case 'push':
            return (rawVal) => {
              const newVal = innerType.mapIn(rawVal, graphCtx, node);
              array.push(newVal);
              node.markDirty();
              return newVal;
            };

          case 'fetchAll':
            return () => Promise.all(array
              .map(x => innerType.mapOut(x, graphCtx, node)));

          case Symbol.iterator:
            return array.map(x =>
              innerType.mapOut(x, graphCtx, node))[Symbol.iterator];

          default:
            // intercept item gets
            if (prop.constructor === String) {
              const int = parseInt(prop);
              if (int.toString() === prop) {
                return innerType.mapOut(array[int], graphCtx, node);
              }
            }

            // TODO: WHAT IS OK? do we want to return raw or mapped for some, includes, map, slice, etc
            //console.log('List get -', prop, new Error().stack.split('\n')[2]);
            return Reflect.get(...arguments);
        }
      },
    });
    return proxy;
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal == null) {
      if (this.defaultValue != null)
        return this.mapIn(this.defaultValue, graphCtx, node);
      return [];
    }
    if (newVal.constructor === Array) {
      return newVal.map(x => this.inner.mapIn(x, graphCtx, node));
    } else throw new Error(
      `List#mapIn() only takes arrays`);
  }

  // intended as general-purpose replacement for ex. gatherRefs
  accept(element, visitor) {
    visitor.visit(this, element);
    if (element === Symbol.for('meta')) {
      this.inner.accept(element, visitor);
    } else {
      for (const entry of element)
        this.inner.accept(entry, visitor);
    }
  }
  // TODO: remove
  gatherRefs(rawVal, refs) {
    if ('gatherRefs' in this.inner)
      for (const innerVal of rawVal)
        this.inner.gatherRefs(innerVal, refs);
  }

  exportData(array, opts) {
    return array.map(item => this
      .inner.exportData(item, opts));
  }
});
