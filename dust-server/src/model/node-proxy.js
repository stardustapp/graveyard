const {promisify, inspect} = require('util');

function inspectNodeProxy(target, prop, receiver, depth, options) {
  if (depth <= 0) {
    return [
      options.stylize('<node', 'number'),
      options.stylize(target.typeName, 'special'),
      options.stylize(`'${target.nodeId}'`, 'string'),
      options.stylize('/>', 'number'),
    ].join(' ');
  }

  let inner = Object.keys(target.fields).join(', ');
  if (depth > 0) {
    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1,
    });
    inner = `     ${inspect(target.fields, newOptions)}`
      .replace(/\n/g, `\n  `);
  }

  return [
    [
      options.stylize('<node', 'number'),
      options.stylize(`type`, 'special'),
      options.stylize(target.typeName, 'name'),
      options.stylize(`id`, 'special'),
      options.stylize(`'${target.nodeId}'`, 'string'),
      //options.stylize(`fields`, 'special'),
      options.stylize('>', 'number'),
    ].join(' '),
    inner,
    options.stylize('  </node>', 'number'),
  ].join('\n');
}

class NodeProxyHandler {
  constructor(type) {
    this.type = type;
    if (type.inner.name !== 'Struct') throw new Error(
      `Unsupported inner type ${type.inner.name}`);

    this.predicates = new Map;
    for (const rel of type.relations) {
      const predicate = rel.type === 'Top' ? 'TOP' : rel.predicate;
      if (!this.predicates.has(predicate))
        this.predicates.set(predicate, new Array);
      this.predicates.get(predicate).push(rel);
    }

    //for (const [key, fieldType] of type.inner.fields.entries()) {
  }
  wrap(dbCtx, nodeId, typeName, data, isDirty=false) {
    const target = {
      nodeId,
      typeName,
    };
    const proxy = new Proxy(target, this);

    let accessor, fields;
    if (data.constructor === Object) {
      accessor = FieldAccessor.forType(this.type.inner);
      fields = accessor.mapOut(data, new GraphContext(dbCtx));
    //} else if (data.constructor === StructAccessor) {
    //  accessor = fields;
    //  struct = accessor.mapOut({}, new GraphContext);
    } else if (data.constructor === NodeProxyHandler) {
      accessor = data.accessor;
      fields = data.fields;
    } else throw new Error(
      `Can't wrap weird data of type ${data.constructor.name}`);

    Object.defineProperties(target, {
      dbCtx: { enumerable: false, value: dbCtx },
      fields: { enumerable: false, value: fields },
      accessor: { enumerable: false, value: accessor },
    });

    if (isDirty) proxy.dirty = isDirty;
    return proxy;
  }

  get(target, prop, receiver) {
    if (prop === 'then') return null;
    if (prop === 'inspect') return null;
    if (prop === 'constructor') return NodeProxyHandler;
    if (prop === 'nodeId') return target.nodeId;
    if (prop === 'typeName') return target.typeName;
    if (prop === 'fields') return target.fields;
    if (prop === 'accessor') return target.accessor;

    if (prop === inspect.custom)
      return inspectNodeProxy.bind(this, target, prop, receiver);
    if (prop === 'walkPredicateOut') return predicate =>
      target.dbCtx.queryGraph({subject: receiver, predicate});
    if (prop === 'toJSON') return () =>
      JSON.stringify(target.fields);

    if (this.predicates.has(prop))
      return new RelationAccessor(target.dbCtx, receiver, this.predicates.get(prop));

    if (prop in target.fields)
      return target.fields[prop];

    if (prop.constructor === Symbol) {
      console.warn('NodeProxyHandler GET with a SYMBOL:', prop);
      return null;
    } else {
      console.log(Object.keys(target.fields), target.fields.Name);
      throw new Error('TODO: GET '+prop);
    }
  }
  set(target, prop, value, receiver) {
    if (prop === 'dirty') {
      if (target.isDirty) return true;
      if (value !== true) return false;
      target.isDirty = true;
      target.dbCtx.actions.push({
        kind: 'put node',
        proxyTarget: target,
      });
      return true;
    }

    if (prop in target.fields) {
      target.fields[prop] = value;
      return true;
    }

    throw new Error('TODO: SET '+prop);
/*
    const constr = value === null ? null : value.constructor;
    switch (constr) {
      case String:
      case Number:
      case Date:
      case Boolean:
        if (dataObj[key] == value) {
          changedKeys.delete(key);
        } else {
          changedKeys.set(key, value);
          knownKeys.add(key);
        }
        break;
      default:
        throw new Error(`NodeProxyHandler doesn't accept values of type ${constr} yet`);
    }*/
  }
  ownKeys(target) {
    console.log('OWNKEYS!');
    return Object.keys(target).concat([
      'nodeId', 'typeName',
      'dirty',
      'walkPredicateOut',
    ]);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    NodeProxyHandler,
  };
}
