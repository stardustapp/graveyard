const {inspect} = require('util');

const accessorInstances = new Map; // FieldType inst => Accessor inst
const accessorConstructors = new Map; // FieldType constr => Accessor constr

class FieldAccessor {
  constructor(myType) {
    Object.defineProperty(this, 'myType', {value: myType});
  }

  static forType(theType) {
    if (accessorInstances.has(theType))
      return accessorInstances.get(theType);
    const accessor = this.constructForType(theType);
    accessorInstances.set(theType, accessor);
    return accessor;
  }

  static constructForType(theType) {
    if (theType.constructor === PendingFieldType) {
      if (theType.final) {
        return this.constructForType(theType.final);
      }
      throw new Error(`PendingFieldType is still pending`);
    }

    if (accessorConstructors.has(theType.constructor)) {
      const constr = accessorConstructors.get(theType.constructor);
      return new constr(theType);
    } else {
      console.log('constructor for', theType)
      throw new Error(
        `FieldAccessor#constructForType() can't handle ${theType.constructor.name}`);
    }
  }

  mapOut() {
    throw new Error(`Reading from ${this.constructor.name} is not implemented`);
  }
}

class PrimitiveAccessor extends FieldAccessor {
  mapOut(value, graphCtx, node) {
    if (value == null) throw new Error('PrimitiveAccessor#mapOut() got null');
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    if (value == null) throw new Error('PrimitiveAccessor#mapIn() got null '+this.myType.default);
    return this.myType.toExt(value);
  }
}

class GraphNode {
  constructor(graphCtx, nodeId, nodeType) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.rawData = null;

    this.isDirty = false;
    graphCtx.loadedNodes.push(this);
  }

  markDirty() {
    this.isDirty = true;
  }
  flush() {
    this.isDirty = false;
  }
}

class NodeAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.typeName = type.name;

    this.structType = FieldAccessor.forType(type.inner);
    const structConstr = this.structType.constructor;
    if (structConstr !== StructAccessor) throw new Error(
      `Unsupported NodeAccessor inner type ${structConstr.name}`);

    this.predicates = new Map;
    for (const rel of type.relations) {
      if (!rel.predicate) continue;
      if (!this.predicates.has(rel.predicate))
        this.predicates.set(rel.predicate, new Array);
      this.predicates.get(rel.predicate).push(rel);
    }
  }

  mapOut({nodeId, type, data}, graphCtx, node) {
    if (type !== this.typeName) throw new Error(
      `Can't mapOut Node - expected '${this.typeName}' but type was '${type}'`);

    const behavior = graphCtx.engine.nameBehaviors.get(type);
    node.rawData = data;

    //Object.defineProperty(node, 'state', {
    //  value: Object.create(null),
    //});

    const struct = this.structType.mapOut(data, graphCtx, node);
    for (const key in struct) {
      if (key === 'isDirty') throw new Error(
        `Copying a NodeAccessor!`);
      const definition = Object.getOwnPropertyDescriptor(struct, key);
      Object.defineProperty(node, key, definition);
    }

    for (const [predicate, edges] of this.predicates) {
      //console.log('defining', predicate)
      Object.defineProperty(node, predicate, {
        value: new RelationAccessor(graphCtx, node, edges, predicate),
        enumerable: true,
      });
    }

    for (const key in behavior) {
      if (key === 'setup') {
        node.ready = behavior[key].call(node);
      } else {
        Object.defineProperty(node, key, {
          value: behavior[key],
        });
      }
    }

    //Object.freeze(node);
    return node;
  }

  mapIn({nodeId, fields}, graphCtx, node) {
    const data = this.structType.mapIn(fields, graphCtx, node);
    return {nodeId, data, type: this.typeName};
  }

  gatherRefs(node, refs) {
    this.structType.gatherRefs(node, refs);
  }
}

class StructAccessor extends FieldAccessor {
  constructor(type) {
    super(type);

    this.fields = type.fields;
    this.defaults = type.defaults;
  }

  mapOut(structVal, graphCtx, node) {
    const target = Object.create(null);
    if (!graphCtx) throw new Error(
      `graphCtx is required!`);

    for (const [name, fieldType] of this.fields) {
      const fieldAccessor = FieldAccessor.forType(fieldType);
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in fieldAccessor) {
        propOpts.get = function() {
          //console.log('getting', name, 'as', fieldType.constructor.name);
          return fieldAccessor.mapOut(structVal[name], graphCtx, node);
        };
      }

      if ('mapIn' in fieldAccessor) {
        propOpts.set = function(newVal) {
          //console.debug('setting', name, 'as', fieldType.constructor.name, newVal);
          structVal[name] = fieldAccessor.mapIn(newVal, graphCtx, node);
          node.markDirty();
          //graphCtx.flushNodes();
          return true;
        };
      }

      Object.defineProperty(target, name, propOpts);
    }
    //Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal.constructor === Object) {
      const dataObj = Object.create(null);
      // create temporary instance to fill in the data
      const accInst = this.mapOut(dataObj, graphCtx, node);
      const allKeys = new Set(this.fields.keys());
      Object.keys(newVal).forEach(x => allKeys.add(x));
      for (const key of allKeys) {
        accInst[key] = newVal[key] || this.defaults.get(key);
      }
      return dataObj;

    } else if (newVal.constructor === undefined) {
      // this is probably us, right?
      return newVal;

    } else throw new Error(
      `StructAccessor can't map in values of ${newVal.constructor.name}`);
  }

  gatherRefs(struct, refs) {
    for (const [name, fieldType] of this.fields) {
      const fieldAccessor = FieldAccessor.forType(fieldType);
      if ('gatherRefs' in fieldAccessor)
        fieldAccessor.gatherRefs(struct[name], refs);
    }
  }
}

class AnyOfKeyedAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.slots = type.slots;
  }

  mapOut(structVal, graphCtx, node) {
    const target = Object.create(null);
    if (!graphCtx) throw new Error(
      `graphCtx is required!`);

    for (const [slotKey, slotType] of this.slots) {
      const slotAccessor = FieldAccessor.forType(slotType);
      const propOpts = {
        enumerable: true,
      }

      if ('mapOut' in slotAccessor) {
        propOpts.get = function() {
          //console.log('getting', slotKey, 'as', slotType.constructor.slotKey);
          return slotAccessor.mapOut(structVal[slotKey], graphCtx, node);
        };
      }

      if ('mapIn' in slotAccessor) {
        propOpts.set = function(newVal) {
          //console.log('setting', slotKey, 'as', slotKey, newVal);
          structVal[slotKey] = slotAccessor.mapIn(newVal, graphCtx, node);

          if (slotKey !== structVal.liveKey) {
            delete structVal[structVal.liveKey];
            structVal.liveKey = slotKey;
          }
          return true;
        };
      }

      Object.defineProperty(target, slotKey, propOpts);
    }
    //Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal.constructor === Object) {
      const keys = Object.keys(newVal);
      if (keys.length !== 1) throw new Error(
        `AnyOfKeyed got ${keys.length} keys instead of exactly 1. Received: ${keys.join(', ')}`);

      const dataObj = Object.create(null);
      const accInst = this.mapOut(dataObj, graphCtx, node);
      for (const key in newVal) {
        accInst[key] = newVal[key];
      }
      return dataObj;
    } else if (newVal.constructor === undefined) {
      // this is probably us, right?
      return newVal;
    } else throw new Error(
      `AnyOfKeyedAccessor can't map in values of ${newVal.constructor.name}`);
  }

  // TODO: know which key is real
  gatherRefs(rawVal, refs) {
    const key = rawVal.liveKey;
    if (!key) {
      console.warn('WARN: AnyOfKeyed gathering refs on empty any');
      return;
    }

    const slotAccessor = FieldAccessor.forType(this.slots.get(rawVal.liveKey));
    if ('gatherRefs' in slotAccessor)
      slotAccessor.gatherRefs(rawVal[rawVal.liveKey], refs);
  }
}

/*
class EmptyOptional {
  constructor() {}
}
const optionalInstProps = {
  ifPresent: {
    value(thenCb, elseCb=null) {
      if (this.isPresent)
        return thenCb(this);
      else if (elseCb)
        return elseCb(null);
      else return
    }
  },
  orElse: {
    value(fallbackVal=undefined) {
      if (this.isPresent)
        return this;
      else if (fallbackVal === undefined) throw new Error(
        `Optional#orElse() called on empty optional without providing a fallback`);
      else
        return fallbackVal;
    }
  },
}
*/

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
          case 'push':
            return (rawVal) => {
              const newVal = innerAccessor.mapIn(rawVal, graphCtx, node);
              array.push(newVal);
              node.markDirty();
              return newVal;
            };

          default:
            // intercept item gets
            if (prop.constructor === String) {
              const int = parseInt(prop);
              if (int.toString() === prop) {
                return innerAccessor.mapOut(array[int], graphCtx, node);
              }
            }

            console.log('ListAccessor get -', prop);
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
}

class ObjectReference {
  constructor(graphCtx, nodeType, nodeId) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.nodeType = nodeType;
    this.nodeId = nodeId;
  }
  fetch() {
    return this.graphCtx.getNodeById(this.nodeId);
  }
}

class ReferenceAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.targetPath = type.targetPath;
    // unfortunately the reference isn't resolved yet
    // maybe we can change that and resolve the ref here but it'll be rough
    // i think we can assume that we point to a Node, or at least a Struct
  }

  mapOut(rawVal, graphCtx, node) {
    //console.log('ReferenceAccessor#mapOut', rawVal);
    if (rawVal && rawVal.constructor === String)
      //return graphCtx.getNodeFast(...rawVal.split('#'));
      return new ObjectReference(graphCtx, ...rawVal.split('#'));
    //console.log('reading ref', rawVal, 'from graph', graphCtx);
    throw new Error(`ReferenceAccessor can't mapOut, rawVal was weird.`);
  }

  mapIn(newVal, graphCtx, node) {
    //console.log('ReferenceAccessor#mapIn', newVal);
    if (newVal === undefined || newVal === null) throw new Error(
      `ReferenceAccessor will not allow null values. Try Optional if you want.`);

    if (newVal.constructor === Object) {
      const type = graphCtx.findNodeBuilder(this.myType.targetPath);
      const accessor = FieldAccessor.forType(type);
      //console.log('ref mapping in', accessor, newVal);
      const node = graphCtx.newNode(accessor, newVal);
      return `${node.nodeType}#${node.nodeId}`;

    } else if (newVal.constructor === GraphReference && newVal.target) {
      if (this.targetPath === '')
      console.log('hello world', this.targetPath, newVal.target);

    } else if (newVal.constructor === GraphNode) {
      const node = newVal;
      return `${node.nodeType}#${node.nodeId}`;
    }
    throw new Error(`ReferenceAccessor doesn't support value ${newVal.constructor.name}`);
  }

  gatherRefs(rawVal, refs) {
    if ([ObjectReference, GraphNode].includes(rawVal.constructor)) {
      refs.add(`${rawVal.nodeType}#${rawVal.nodeId}`);
    } else if (rawVal.constructor === String) {
      refs.add(rawVal);
    } else {
      throw new Error(`TODO: gatherRefs() got weird constr ${rawVal.constructor.name}`)
    }
  }
}

class RelationAccessor {
  constructor(graphCtx, localNode, relations, predicate) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.localNode = localNode;
    this.relations = relations;
    this.predicate = predicate;

    //console.log(localNode.nodeType)
    for (const relation of relations) {
      //console.log(relation.type, relation.otherName)
      if (relation.direction === 'out') {

        //console.log('adding', relation.predicate, 'to type', relation.otherName)
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

      };
    }
  }

  fetchAllObjects() {
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: this.predicate,
      })
      .fetchObjects();
  }

  [inspect.custom]() {
    return '[RelationAccessor]'; // TODO
  }

  async attachNode(relation, otherNode) {
    if (!relation.predicate) throw new Error(
      `Can't attach nodes to predicates`);

    //if (relation.direction === 'out') {
      await this.graphCtx.newEdge({
        subject: this.localNode,
        predicate: relation.predicate,
        object: otherNode,
      });
    // } else {
    //   await this.graphCtx.newEdge({
    //     subject: otherNode,
    //     predicate: relation.predicate,
    //     object: this.localNode,
    //   });
    // }
  }

  async attachNewNode(relation, fields, nodeId=null) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach new nodes to non-Arbitrary relations`);

    const otherAccessor = FieldAccessor.forType(relation.otherType);
    const other = nodeId
      ? await this.graphCtx.putNode(otherAccessor, fields, nodeId)
      : await this.graphCtx.newNode(otherAccessor, fields);
    await other.ready;
    await this.attachNode(relation, other);
    return other;
  }

  findOneNode(relation, query) {
    console.log('find one node', relation, query);
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
        objectType: relation.otherType,
      })
      .findOneObject(query);
  }

  async fetchNodeList(relation) {
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
        objectType: relation.otherType,
      })
      .fetchObjects();
  }
}

accessorConstructors.set(NodeBuilder, NodeAccessor);
accessorConstructors.set(BuiltinFieldType, PrimitiveAccessor);
accessorConstructors.set(UnstructuredFieldType, PrimitiveAccessor);
accessorConstructors.set(StructFieldType, StructAccessor);
accessorConstructors.set(OptionalFieldType, OptionalAccessor);
accessorConstructors.set(ReferenceFieldType, ReferenceAccessor);
accessorConstructors.set(AnyOfKeyedFieldType, AnyOfKeyedAccessor);
accessorConstructors.set(ListFieldType, ListAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    FieldAccessor,
    StructAccessor,
    OptionalAccessor,
    ListAccessor,

    GraphNode,
    NodeAccessor,
    RelationAccessor,
  };
}
