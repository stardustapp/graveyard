
class GraphNode {
  constructor(graphCtx, nodeId, nodeType, nodeScope=null) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.nodeId = nodeId;
    this.nodeType = nodeType;
    this.nodeScope = nodeScope;
    this.rawData = null;

    if (nodeType==='Dependency')
      console.log('dep created', new Error().stack.split('\n').slice(2).join('\n'))

    this.isDirty = false;
    if (graphCtx.loadedNodes) {
      if (graphCtx.loadedNodes.has(nodeId)) throw new Error(
        `GraphNode collision in GraphContext`);
      graphCtx.loadedNodes.set(nodeId, this);
    }
  }

  identify() {
    return this.graphCtx.identifyNode(this);
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

  mapOut({nodeId, nodeType, nodeScope, data}, graphCtx, node) {
    if (nodeType !== this.typeName) throw new Error(
      `Can't mapOut Node - expected '${this.typeName}' but type was '${nodeType}'`);

    const behavior = graphCtx.engine.nameBehaviors.get(nodeType);
    node.rawData = data;
    node.exportData = this.exportData.bind(this, node);
    if (nodeScope)
      node.nodeScope = nodeScope;

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

  mapIn({nodeId, nodeScope, fields}, graphCtx, node) {
    const data = this.structType.mapIn(fields, graphCtx, node);
    return {nodeId, nodeScope, data, nodeType: this.typeName};
  }

  gatherRefs(node, refs) {
    //console.log('gather refs', node)
    this.structType.gatherRefs(node, refs);
  }
  exportData(node, opts) {
    return this.structType.exportData(node.rawData, opts);
  }
}

accessorConstructors.set(NodeBuilder, NodeAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    GraphNode,
    NodeAccessor,
  };
}
