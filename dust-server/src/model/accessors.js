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
    if (accessorConstructors.has(theType.constructor)) {
      const constr = accessorConstructors.get(theType.constructor);
      return new constr(theType);
    } else throw new Error(
      `FieldAccessor#constructForType() can't handle ${theType.constructor.name}`);
  }

  mapOut() {
    throw new Error(`Reading from ${this.constructor.name} is not implemented`);
  }
}

class PrimitiveAccessor extends FieldAccessor {
  mapOut(value, graphCtx) {
    return this.myType.fromExt(value);
  }
  mapIn(value, graphCtx) {
    return new this.myType.constr(value);
  }
}

class GraphNode {}

class NodeAccessor extends FieldAccessor {
  constructor(type) {
    super(type);

    this.structType = FieldAccessor.forType(type.inner);
    const structConstr = this.structType.constructor;
    if (structConstr !== StructAccessor) throw new Error(
      `Unsupported NodeAccessor inner type ${structConstr.name}`);

    this.predicates = new Map;
    for (const rel of type.relations) {
      const predicate = rel.type === 'Top' ? 'TOP' : rel.predicate;
      if (!this.predicates.has(predicate))
        this.predicates.set(predicate, new Array);
      this.predicates.get(predicate).push(rel);
    }
  }

  mapOut({typeName, nodeId, data}, graphCtx) {
    if (typeName !== this.myType.name) throw new Error(
      `Can't mapOut Node - expected '${this.myType.name}' but type was '${typeName}'`);

    const node = new GraphNode(graphCtx, nodeId);

    Object.defineProperty(node, 'state', {
      value: Object.create(null),
    });

    const struct = this.structType.mapOut(data, graphCtx);
    for (const key in struct) {
      const definition = Object.getOwnPropertyDescriptor(struct, key);
      Object.defineProperty(node, key, definition);
    }

    Object.freeze(node);
    return node;
  }

  mapIn({nodeId, fields}, graphCtx) {
    const data = this.structType.mapIn(fields, graphCtx);
    graphCtx.actions.push({
      type: 'put node',
      typeName: this.myType.name,
      nodeId, data,
    });
    return {nodeId, data};
  }
}

class StructAccessor extends FieldAccessor {
  constructor(type) {
    super(type);

    this.fields = type.fields;
  }

  mapOut(structVal, graphCtx) {
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
          return fieldAccessor.mapOut(structVal[name], graphCtx);
        };
      }

      if ('mapIn' in fieldAccessor) {
        propOpts.set = function(newVal) {
          //console.log('setting', name, 'as', fieldType.constructor.name, newVal);
          structVal[name] = fieldAccessor.mapIn(newVal, graphCtx);
          return true;
        };
      }

      Object.defineProperty(target, name, propOpts);
    }
    Object.freeze(target);
    return target;
  }

  mapIn(newVal, graphCtx) {
    if (newVal.constructor === Object) {
      const dataObj = Object.create(null);
      const accInst = this.mapOut(dataObj, graphCtx);
      for (const key in newVal) {
        accInst[key] = newVal[key];
      }
      return dataObj;
    } else if (newVal.constructor === undefined) {
      // this is probably us, right?
      return newVal;
    } else throw new Error(
      `StructAccess can't map in values of ${newVal.constructor.name}`);
  }
}

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

class OptionalAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.innerAccessor = FieldAccessor.forType(type.inner);
  }

  mapOut(rawVal, graphCtx) {
    let innerVal;
    if (rawVal === undefined || rawVal === null)
      innerVal = new EmptyOptional;
    else {
      innerVal = this.innerAccessor.mapOut(rawVal, graphCtx);
    }

    Object.defineProperties(innerVal, {
      isPresent: {
        value: innerVal.constructor !== EmptyOptional,
      },
      ...optionalInstProps,
    });
    return innerVal;
  }

  mapIn(newVal, graphCtx) {
    if (newVal === undefined || newVal === null)
      return null;
    return this.innerAccessor.mapIn(newVal, graphCtx);
  }
}

/*
class ListAccessor extends Array {
  constructor(dbCtx, nodeProxy, listType, rawVal) {
    super(dbCtx, nodeProxy, listType, rawVal);
    const innerType = listType.inner;

    Object.defineProperties(this, {
      pushNew: {
        async value(fields) {
          if (innerType.constructor !== ReferenceFieldType) throw new Error(
            `Can't pushNew() against a non-reference!`);
          const newNode = await dbCtx.newNode({name: innerType.targetPath}, fields);
          rawVal.push(newNode);
          return newNode;
        }
      }
    });
  }
}*/

class ReferenceAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    //this.targetPath = type.targetPath;
    // unfortunately the reference isn't resolved yet
    // maybe we can change that and resolve the ref here but it'll be rough
    // i think we can assume that we point to a Node, or at least a Struct
  }

  mapOut22(rawVal, graphCtx) {
  }

  mapIn(newVal, graphCtx) {
    if (newVal === undefined || newVal === null) throw new Error(
      `ReferenceAccessor will not allow null values. Try Optional if you want.`);

    if (newVal.constructor === Object) {
      const type = graphCtx.findNodeBuilder(this.myType.targetPath);
      const accessor = FieldAccessor.forType(type.inner);

      const dataObj = Object.create(null);
      const accInst = accessor.mapOut(dataObj, graphCtx);
      for (const key in newVal) {
        accInst[key] = newVal[key];
      }
      return dataObj;
    }

    return this.innerAccessor.mapIn(newVal, graphCtx);
  }
}

/*
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
    console.log('find one node', relation, query);
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
*/

accessorConstructors.set(NodeBuilder, NodeAccessor);
accessorConstructors.set(BuiltinFieldType, PrimitiveAccessor);
accessorConstructors.set(StructFieldType, StructAccessor);
accessorConstructors.set(OptionalFieldType, OptionalAccessor);
accessorConstructors.set(ReferenceFieldType, ReferenceAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    FieldAccessor,
    NodeAccessor,
    //RelationAccessor,
    StructAccessor,
    OptionalAccessor,
    //ListAccessor,
  };
}
