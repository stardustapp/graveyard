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
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx, node) {
    return this.myType.toExt(value);
  }
}

class GraphNode {
  constructor(graphCtx, nodeId, nodeType) {
    this.graphCtx = graphCtx;
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.rawData = null;

    this.isDirty = false;
    graphCtx.loadedNodes.push(this)
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
      if (rel.type === 'Top') continue;
      const predicate = rel.type === 'Top' ? 'TOP' : rel.predicate;
      if (!this.predicates.has(predicate))
        this.predicates.set(predicate, new Array);
      this.predicates.get(predicate).push(rel);
    }
  }

  mapOut({nodeId, type, data}, graphCtx) {
    if (type !== this.typeName) throw new Error(
      `Can't mapOut Node - expected '${this.typeName}' but type was '${type}'`);

    const behavior = graphCtx.engine.nameBehaviors.get(type);
    const node = new GraphNode(graphCtx, nodeId, type);
    node.rawData = data;
    //graphCtx.flushNodes();

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
      Object.defineProperty(node, predicate, {
        value: new RelationAccessor(graphCtx, node, edges),
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
}

class StructAccessor extends FieldAccessor {
  constructor(type) {
    super(type);

    this.fields = type.fields;
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
          //console.log('setting', name, 'as', fieldType.constructor.name, newVal);
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
      for (const key in newVal) {
        accInst[key] = newVal[key];
      }
      return dataObj;

    } else if (newVal.constructor === undefined) {
      // this is probably us, right?
      return newVal;

    } else throw new Error(
      `StructAccessor can't map in values of ${newVal.constructor.name}`);
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
          //console.log('setting', slotKey, 'as', slotType.constructor.slotKey, newVal);
          structVal[slotKey] = slotAccessor.mapIn(newVal, graphCtx, node);
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
}

class ListAccessor extends Array {
  constructor(type) {
    super(type);
    this.innerAccessor = FieldAccessor.forType(type.inner);
  }

  mapOut(rawVal, graphCtx, node) {
    const {innerAccessor} = this;
    const array = rawVal ? rawVal.slice(0) : [];
    const proxy = new Proxy(array, {
      get(target, prop, receiver) {
        console.log('!!! get proxy -', prop);
        switch (prop) {
          case 'push':
            return (rawVal) => {
              console.log('pushing onto', innerAccessor);
              const newVal = innerAccessor.mapIn(rawVal, graphCtx, node);
              array.push(newVal);
              node.markDirty();
              //graphCtx.flushNodes();
              return newVal;
            };
          default:
            return Reflect.get(...arguments);
        }
      },
    });
    return proxy;
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal.constructor === Array) {
      return newVal.map(x => this.innerAccessor.mapIn(x, graphCtx, node));
    } else throw new Error(
      `ListAccessor#mapIn() only takes arrays`);
  }
}

class ObjectReference {
  constructor(graphCtx, nodeId) {
    this.graphCtx = graphCtx;
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
    if (rawVal && rawVal.constructor === String)
      return new ObjectReference(graphCtx, rawVal);
    console.log('reading ref', rawVal, 'from graph', graphCtx);
    throw new Error(`ReferenceAccessor can't mapOut, rawVal was weird.`);
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal === undefined || newVal === null) throw new Error(
      `ReferenceAccessor will not allow null values. Try Optional if you want.`);

    //console.log('mapping reference', newVal);
    if (newVal.constructor === Object) {
      const type = graphCtx.findNodeBuilder(this.myType.targetPath);
      const accessor = FieldAccessor.forType(type);
      console.log('ref mapping in', accessor, newVal);
      const newNode = graphCtx.newNode(accessor, newVal);
      return newNode;

    } else if (newVal.constructor === GraphReference && newVal.target) {
      console.log('hello world', this.targetPath, newVal.target);

    } else if (newVal.constructor === GraphNode) {
      return newVal.nodeId;

    } else {
      throw new Error(`ReferenceAccessor doesn't support value ${newVal.constructor.name}`);
      //return this.innerAccessor.mapIn(newVal, graphCtx);
    }
  }
}

class RelationAccessor {
  constructor(graphCtx, localNode, relations) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.localNode = localNode;
    this.relations = relations;

    for (const relation of relations) {
      if (relation.type === 'Arbitrary') {

        //console.log('adding', relation.predicate, 'to type', relation.otherName)
        Object.defineProperty(this, `new${relation.otherName}`, {
          enumerable: true,
          value: this.attachNewNode.bind(this, relation),
        });
        Object.defineProperty(this, `attach${relation.otherName}`, {
          enumerable: true,
          value: this.attachNode.bind(this, relation),
        });

        if (relation.direction !== 'out')
          continue;

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

  [inspect.custom]() {
    return '[RelationAccessor]'; // TODO
  }

  async attachNode(relation, otherNode) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach existing nodes to non-Arbitrary relations`);

    if (relation.direction === 'out') {
      await this.graphCtx.newEdge({
        subject: this.localNode,
        predicate: relation.predicate,
        object: otherNode,
      }, relation);
    } else {
      await this.graphCtx.newEdge({
        subject: otherNode,
        predicate: relation.predicate,
        object: this.localNode,
      }, relation);
    }
  }

  async attachNewNode(relation, fields) {
    if (relation.type !== 'Arbitrary') throw new Error(
      `Can't attach new nodes to non-Arbitrary relations`);

    const otherAccessor = FieldAccessor.forType(relation.otherType);
    const other = await this.graphCtx.newNode(otherAccessor, fields);
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
      })
      .findOneObject(query);
  }

  async fetchNodeList(relation) {
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
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
