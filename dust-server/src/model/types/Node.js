
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

accessorConstructors.set(NodeBuilder, NodeAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    GraphNode,
    NodeAccessor,
  };
}
