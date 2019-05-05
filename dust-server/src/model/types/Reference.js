
class GraphReference {
  constructor(target) {
    this.target = target;

    if (!this.target) throw new Error(
      `GraphReference to falsely target!`);
  }
  // TODO
}

class ReferenceFieldType extends FieldType {
  constructor(targetDef) {
    super('core', 'Reference');
    if (targetDef === true) {
      this.anyType = true;
      return;
    } else if (typeof targetDef === 'string') {
      this.targetName = targetDef;
    } else if (typeof targetDef === 'object') {
      this.engineKey = targetDef.engine;
      this.targetName = targetDef.name;
    } else throw new Error(
      `Can't construct reference from ${typeof targetDef} definition`);

    if (typeof this.targetName !== 'string') throw new Error(
      `References must have a string 'type', got '${typeof this.targetName}'`);
  }
  resolveTarget(graphCtx) {
    if (this.engineKey) {
      const targetEngine = GraphEngine.get(this.engineKey);
      return targetEngine.names.get(this.targetName);
    } else {
      return graphCtx.findNodeBuilder(this.refType.targetName);
    }
  }
  fromExt(input) {
    if (!input) throw new FieldTypeError(this,
      `Reference cannot be null`);
    if (input.constructor === GraphReference) return input;
    if (input.constructor === GraphGhostNode) return new GraphReference(input);
    if (input.constructor === NodeProxyHandler) return new GraphReference(input);
    if (GraphObject.prototype.isPrototypeOf(input)) return new GraphReference(input);
    if (input.constructor !== GraphBuilderNode) throw new FieldTypeError(this,
      `Reference must be to a GraphBuilderNode or GraphReference or GraphGhostNode or GraphObject or NodeProxyHandler, was ${input.constructor.name} (TODO)`);
    if (input.type !== this.targetDef.type) throw new FieldTypeError(this,
      `Reference expected to be ${this.targetDef.type}, was ${input.type}`);
    return new GraphReference(input);
  }
  get isForeign() {
    return !!this.engineKey;
  }
}


class ObjectReference {
  constructor(graphCtx, identifier) {
    Object.defineProperty(this, 'graphCtx', {
      enumerable: false,
      value: graphCtx,
    });
    this.identifier = identifier;
  }
  fetch() {
    return this.graphCtx.getNodeByIdentity(this.identifier);
  }
}

class ReferenceAccessor extends FieldAccessor {
  constructor(type) {
    super(type);
    this.refType = type;
    // unfortunately the reference isn't resolved yet
    // maybe we can change that and resolve the ref here but it'll be rough
    // i think we can assume that we point to a Node, or at least a Struct
  }

  mapOut(rawVal, graphCtx, node) {
    //console.log('ReferenceAccessor#mapOut', rawVal);
    if (rawVal === null || rawVal === undefined) throw new Error(
      `ReferenceAccessor mapping out null!`);
    if (rawVal && rawVal.constructor === String) {
      return graphCtx.getNodeByIdentity(rawVal);
    }
      //return new ObjectReference(graphCtx, rawVal);
    console.log('reading ref', rawVal, 'from node', node);
    throw new Error(`ReferenceAccessor can't mapOut, rawVal was weird.`);
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal === undefined || newVal === null) throw new Error(
      `ReferenceAccessor will not allow null values. Try Optional if you want.`);
      console.log('ReferenceAccessor#mapIn', newVal.constructor.name);

    if (newVal.constructor === Object) {
      const type = this.refType.targetType || graphCtx.findNodeBuilder(this.refType.targetName);
      const accessor = FieldAccessor.forType(type);
      //console.log('ref mapping in', accessor, newVal);
      const node = graphCtx.newNode(accessor, newVal);
      return graphCtx.identifyNode(node);

    } else if (newVal.constructor === GraphReference && newVal.target) {
      //if (this.targetPath === '')
      console.log('hello world', this.targetPath, newVal.target);

    } else if (newVal.constructor === GraphNode) {
      const node = newVal;
      console.log('reffing to', graphCtx.identifyNode(node));
      console.log(new Error().stack.split('\n')[2]);
      return graphCtx.identifyNode(node);
    }
    throw new Error(`ReferenceAccessor doesn't support value ${newVal.constructor.name}`);
  }

  gatherRefs(rawVal, refs) {
    if (rawVal == null) throw new Error(
      `Reference gatherRefs() given a null`);
    //if ([ObjectReference].includes(rawVal.constructor)) {
    //  refs.add(rawVal);
    if (rawVal.constructor === GraphNode) {
      refs.add(rawVal);
    //} else if (rawVal.constructor === String) {
    //  refs.add(rawVal);
    } else {
      throw new Error(`TODO: gatherRefs() got weird constr ${rawVal.constructor.name}`)
    }
  }
  exportData(rawVal, opts={}) {
    if (rawVal == null) throw new Error(
      `Reference#exportData() was given a null`);
    if ('refMapper' in opts) {
      const newRef = opts.refMapper(rawVal);
      if (newRef == null) throw new Error(
        `Reference#exportData() got null from refMapper for ${rawVal}`);
      return newRef;
    }
    return rawVal;
  }
}

accessorConstructors.set(ReferenceFieldType, ReferenceAccessor);

if (typeof module !== 'undefined') {
  module.exports = {
    GraphReference,
    ReferenceFieldType,
    ObjectReference,
    ReferenceAccessor,
  };
}
