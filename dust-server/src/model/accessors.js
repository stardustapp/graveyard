
class StructAccessor {
  constructor(dbCtx, nodeProxy, structType, rawVal) {
    for (const [name, fieldType] of structType.fields) {
      //console.log(name, val);
      Object.defineProperty(this, name, {
        enumerable: true,
        get() {
          //console.log('getting', name, 'as', fieldType.constructor.name);//, new Error().stack);
          const value = rawVal[name];

          switch (fieldType.constructor) {
            case BuiltinFieldType:
              return value;
              // return fieldType.constr(target.fields[prop]);
            case OptionalFieldType:
              return new OptionalAccessor(dbCtx, nodeProxy, fieldType, rawVal[name]);
            case ListFieldType:
              return new ListAccessor(dbCtx, nodeProxy, fieldType, rawVal[name]);
            case StructFieldType:
              return new StructAccessor(dbCtx, nodeProxy, fieldType, rawVal[name]);
          }
          throw new Error(`STRUCT GET ${fieldType.constructor.name} '${name}'`);
        },
        set(newVal)  {
          console.log('setting', name, 'as', fieldType.constructor.name, newVal);//, new Error().stack);
          rawVal[name] = fieldType.fromExt(newVal);
          return true;
        }
      });
    }
  }
}

class OptionalAccessor {
  constructor(dbCtx, nodeProxy, optionalType, rawVal) {
    Object.defineProperties(this, {
      isPresent: {
        get() {
          return rawVal != null;
        }
      },
      orElse: {
        value(otherVal) {
          if (this.isPresent)
            return rawVal;
          return otherVal;
        },
      },
      orNull: {
        get() {
          if (this.isPresent)
            return rawVal;
          return null;
        },
      },
      orThrow: {
        value(errCb=null) {
          if (this.isPresent)
            return rawVal;
          if (errCb)
            throw errCb();
          throw new Error(
            `Called #orThrow on empty Optional`);
        },
      },
      // TODO: how can map work??
      mapOr: {
        value(ifPresent, ifMissing) {
          if (this.isPresent)
            return ifPresent(rawVal);
          else
            return ifMissing();
        }
      },
      mapOrNull: {
        value(ifPresent) {
          if (rawVal !== null)
            return ifPresent(rawVal);
          else
            return null;
        }
      },
    });
  }
}

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

if (typeof module !== 'undefined') {
  module.exports = {
    StructAccessor,
    OptionalAccessor,
    ListAccessor,
    RelationAccessor,
  };
}
