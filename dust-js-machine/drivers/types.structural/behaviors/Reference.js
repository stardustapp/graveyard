class GraphReference {
  constructor(target) {
    this.target = target;

    if (!this.target) throw new Error(
      `GraphReference to falsely target!`);
  }
  // TODO
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


CURRENT_LOADER.attachBehavior(class Reference {
  build({config, typeResolver}) {
    this.targetDef = config.reference;

    if (this.targetDef === true) {
      this.anyType = true;
      return;
    } else if (typeof this.targetDef === 'string') {
      this.targetName = this.targetDef;
    } else if (typeof this.targetDef === 'object') {
      this.engineKey = this.targetDef.engine;
      this.targetName = this.targetDef.name;
    } else throw new Error(
      `Can't construct reference from ${typeof this.targetDef} definition`);

    if (typeof this.targetName !== 'string') throw new Error(
      `References must have a string 'type', got '${typeof this.targetName}'`);
  }

  resolveTarget(graphCtx) {
    if (this.engineKey) {
      const targetEngine = GraphEngine.get(this.engineKey);
      return targetEngine.names.get(this.targetName);
    } else {
      return graphCtx.findNodeBuilder(this.targetName);
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


  mapOut(rawVal, graphCtx, node) {
    //console.log('Reference#mapOut', rawVal);
    if (rawVal === null || rawVal === undefined) throw new Error(
      `Reference mapping out null!`);
    if (rawVal && rawVal.constructor) {
      const {otherName} = this.relation;
      if (rawVal.constructor.name === otherName) {
        return rawVal;
      }
    }
    if (rawVal && rawVal.constructor === String) {
      return graphCtx.getNodeByIdentity(rawVal);
    }
      //return new ObjectReference(graphCtx, rawVal);
    console.log('reading ref', rawVal, 'from node', node);
    throw new Error(`Reference can't mapOut, rawVal was weird.`);
  }

  mapIn(newVal, graphCtx, node) {
    if (newVal === undefined || newVal === null) throw new Error(
      `Reference will not allow null values. Try Optional if you want.`);
      //console.debug('Reference#mapIn', newVal.constructor.name);

    if (newVal.constructor === Object) {
      const {otherType, otherName} = this.relation;
      const type = otherType || graphCtx.findNodeBuilder(otherName);
      return graphCtx.createNode(type, newVal);

    } else if (newVal.constructor === GraphReference && newVal.target) {
      //if (this.targetPath === '')
      console.log('hello world', this.targetPath, newVal.target);

    } else if (newVal.constructor === 'GraphNode') {
      const node = newVal;
      //console.debug('reffing to', graphCtx.identifyNode(node));
      //console.debug(new Error().stack.split('\n')[2]);
      return graphCtx.identifyNode(node);
    }

    if (newVal && newVal.constructor) {
      const {otherName} = this.relation;
      if (newVal.constructor.name === otherName) {
        return newVal;
      }
    }

    throw new Error(`Reference doesn't support value ${newVal.constructor.name}`);
  }

  // intended as general-purpose replacement for ex. gatherRefs
  accept(element, visitor) {
    visitor.visit(this, element);
    //this...accept(isMetaVisitor ? element : element[name], visitor);
  }
  // TODO: remove
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
});
