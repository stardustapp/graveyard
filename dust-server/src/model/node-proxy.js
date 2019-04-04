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
  wrap(dbCtx, nodeId, typeName, fields, isDirty=false) {
    const target = {
      nodeId,
      typeName,
      fields,
    };
    Object.defineProperty(target, 'dbCtx', {
      enumerable: false,
      value: dbCtx,
    });

    const proxy = new Proxy(target, this);
    if (isDirty) proxy.dirty = isDirty;
    return proxy;
  }

  get(target, prop, receiver) {
    if (prop === 'then') return null;
    if (prop === 'inspect') return null;
    if (prop === 'constructor') return NodeProxyHandler;
    if (prop === 'nodeId') return target.nodeId;
    if (prop === 'typeName') return target.typeName;

    if (prop === inspect.custom)
      return inspectNodeProxy.bind(this, target, prop, receiver);
    if (prop === 'walkPredicateOut') return predicate =>
      target.dbCtx.queryGraph({subject: receiver, predicate});
    if (prop === 'toJSON') return () =>
      JSON.stringify(target.fields);

    if (this.predicates.has(prop))
      return new RelationAccessor(target.dbCtx, receiver, this.predicates.get(prop));

    if (this.type.inner.fields.has(prop)) {
      const fieldType = this.type.inner.fields.get(prop);
      //if (fieldType.origin === 'core') {
      //  return fieldType.constr(target.fields[prop]);
      //}
      return target.fields[prop];
      console.log('getting', field);
    }

    if (prop.constructor === Symbol) {
      console.warn('NodeProxyHandler GET with a SYMBOL:', prop);
      return null;
    } else {
      console.log(Object.keys(target), target.fields.Name);
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

    throw new Error('TODO: SET '+prop);

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
    }
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

class RelationAccessor {
  constructor(dbCtx, localNode, relations) {
    Object.defineProperty(this, 'dbCtx', {
      enumerable: false,
      value: dbCtx,
    });
    this.localNode = localNode;
    this.relations = relations;

    for (const relation of relations) {
      if (relation.type === 'Arbitrary') {
        if (relation.direction !== 'out')
          continue;

        Object.defineProperty(this, `new${relation.otherName}`, {
          enumerable: true,
          value: this.attachNewNode.bind(this, relation),
        });
        Object.defineProperty(this, `attach${relation.otherName}`, {
          enumerable: true,
          value: this.attachNode.bind(this, relation),
        });
        Object.defineProperty(this, `find${relation.otherName}`, {
          enumerable: true,
          value: this.findOneNode.bind(this, relation),
        });
        Object.defineProperty(this, `fetch${relation.otherName}List`, {
          enumerable: true,
          value: this.fetchNodeList.bind(this, relation),
        });
      } else throw new Error(
        `TODO: RelationAccessor doesn't support ${relation.type} relations`);
    }
  }

  async attachNode(relation, otherNode) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach existing nodes to non-Arbitrary relations`);

    if (relation.direction === 'out') {
      await this.dbCtx.newEdge({
        subject: this.localNode,
        predicate: relation.predicate,
        object: otherNode,
      }, relation);
    } else {
      await this.dbCtx.newEdge({
        subject: otherNode,
        predicate: relation.predicate,
        object: this.localNode,
      }, relation);
    }
  }

  async attachNewNode(relation, fields) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach new nodes to non-Arbitrary relations`);

    const other = await this.dbCtx.newNode(relation.otherType, fields);
    await this.attachNode(relation, other);
    return other;
  }

  findOneNode(relation, query) {
    console.log('find one node', this.localNode, relation);
    return this.dbCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
      })
      .findOne(query);
  }

  async fetchNodeList(relation) {
    return this.dbCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
      })
      .fetchObjects();
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    NodeProxyHandler,
  };
}
