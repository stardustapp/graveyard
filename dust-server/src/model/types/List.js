
class ListFieldType extends FieldType {
  constructor(config, inner) {
    super('composite', 'List');
    this.inner = inner;
  }
  fromExt(input) {
    //console.log(input);
    if (!input || input.constructor !== Array) throw new FieldTypeError(this,
      `Was not given an Array`);
    return input.map(x => this.inner.fromExt(x));
  }
}


class ListAccessor extends Array {
  constructor(type) {
    super(type);
    this.innerAccessor = FieldAccessor.forType(type.inner);
  }

  mapOut(rawVal, graphCtx, node) {
    const {innerAccessor} = this;
    const array = rawVal || [];
    const proxy = new Proxy(array, {
      get(target, prop, receiver) {
        switch (prop) {

          case 'length':
            return rawVal.length;

          case 'push':
            return (rawVal) => {
              const newVal = innerAccessor.mapIn(rawVal, graphCtx, node);
              array.push(newVal);
              node.markDirty();
              return newVal;
            };

          case 'fetchAll':
            return () => Promise.all(array
              .map(x => innerAccessor.mapOut(x, graphCtx, node)));

          case Symbol.iterator:
            return array.map(x =>
              innerAccessor.mapOut(x, graphCtx, node))[Symbol.iterator];

          default:
            // intercept item gets
            if (prop.constructor === String) {
              const int = parseInt(prop);
              if (int.toString() === prop) {
                return innerAccessor.mapOut(array[int], graphCtx, node);
              }
            }

            console.log('ListAccessor get -', prop, new Error().stack.split('\n')[2]);
            return Reflect.get(...arguments);
        }
      },
    });
    return proxy;
  }

  mapIn(newVal, graphCtx, node) {
    if (!newVal) return [];
    if (newVal.constructor === Array) {
      return newVal.map(x => this.innerAccessor.mapIn(x, graphCtx, node));
    } else throw new Error(
      `ListAccessor#mapIn() only takes arrays`);
  }

  gatherRefs(rawVal, refs) {
    for (const innerVal of rawVal) {
      this.innerAccessor.gatherRefs(innerVal, refs);
    }
  }
  exportData(array, opts) {
    return array.map(item => this
      .innerAccessor.exportData(item, opts));
  }
}

accessorConstructors.set(ListFieldType, ListAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    ListFieldType,
    ListAccessor,
  };
}
