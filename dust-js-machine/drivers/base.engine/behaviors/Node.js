CURRENT_LOADER.attachBehavior(class Node {
  build({
    RelationBuilder,
    EngineDriver,
    FieldDriver,
    RawConfig,
  }) {
    console.log('setting up node config', Object.keys(RawConfig));
    this.inner = FieldDriver.constructFrom(RawConfig);
    this.relations = [];

    // TODO: relocate to 'structure' engine
    const references = new Map;
    const offered = new Set;
    this.inner.accept(Symbol.for('meta'), {
      offer: field => {
        if (offered.has(field)) return true;
        offered.add(field);
      },
      visit: field => {
        if (field.__origin.name !== 'Reference') return;
        //console.log('visiting field', field);
        references.set([field.engineKey, field.targetName].join('#'), field);
      },
    });

    for (const refType of references.values()) {
      if (refType.anyType)
        continue;
      const relation = RelationBuilder({
        kind: 'ref',
        engineKey: refType.engineKey,
        object: refType.targetName,
      });
      refType.relation = relation;
      this.relations.push(relation);
    }
    if (RawConfig.relations) {
      for (const relation of RawConfig.relations) {
        this.relations.push(RelationBuilder(relation));
      }
    }
    if (this.relations.length === 0) {
      console.warn(`Node ${this} has no relations, will be inaccessible`);
    }

    this.predicates = new Map;
    for (const rel of this.relations) {
      if (!rel.predicate) continue;
      if (!this.predicates.has(rel.predicate))
        this.predicates.set(rel.predicate, new Array);
      //console.log('recording predicate', rel.predicate)
      this.predicates.get(rel.predicate).push(rel);
    }

    // TODO
    //console.log(EngineDriver._getBehavior())
    //this.behavior = config.behavior || GraphObject;
  }

  async link(resolver) {
    let worked = false;
    try {
      for (const relation of this.relations) {
        await relation.link(this, resolver);
      }
      worked = true;
    } finally {
      if (!worked)
        console.error('Failed to link', this);
    }
  }

  fromExt(data) {
    if (!this.inner.fromExt) throw new Error(
      `Part ${this.inner.constructor.name} not fromExt-capable`);
    return this.inner.fromExt(data);
  }
  setField(data, path, value) {
    if (!this.inner.setField) throw new Error(
      `Part ${this.inner.constructor.name} not setField-capable`);
    return this.inner.setField(data, path, value);
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    if (depth < 0) {
      return [
        options.stylize('<node builder', 'date'),
        options.stylize(this.name, 'special'),
        options.stylize('/>', 'date'),
      ].join(' ');
    }

    const {inspect} = require('util');
    const newOptions = Object.assign({}, options, {
      depth: options.depth === null ? null : options.depth - 1,
      indentationLvl: options.indentationLvl + 2,
    });
    const prefix = ' '.repeat(options.indentationLvl);
    const body = ['inner', 'relations', 'behavior'].map(prop =>
      `${prefix}  ${prop}: ${inspect(this[prop], newOptions)}`
        .replace(/\n/g, `${prefix}    \n`));

    return [
      [
        options.stylize('<node builder', 'date'),
        options.stylize(`name`, 'special'),
        options.stylize(this.name, 'name'),
        options.stylize(`type`, 'special'),
        options.stylize(this.inner.name, 'name'),
        options.stylize('>', 'date'),
      ].join(' '),
      ...body,
      options.stylize(`${prefix}</node>`, 'date'),
    ].join('\n');
  }

  mapOut(structVal, graphCtx, node) {
    const struct = this.inner.mapOut(structVal, graphCtx, node);
    for (const key in struct) {
      if (key === 'isDirty') throw new Error(
        `Copying a NodeAccessor!`);
      const definition = Object.getOwnPropertyDescriptor(struct, key);
      Object.defineProperty(node, key, definition);
    }

    for (const [predicate, edges] of this.predicates) {
      console.log('defining', predicate)
      Object.defineProperty(node, predicate, {
        value: new PredicateAccessor(graphCtx, node, edges, predicate),
        enumerable: true,
      });
    }

    // const behavior = graphCtx.engine.nameBehaviors.get(this.typeName);
    // for (const key in behavior) {
    //   Object.defineProperty(node, key, {
    //     value: behavior[key],
    //   });
    // }

    Object.defineProperty(node, 'exportData', {
      value: (opts) => {
        //const storedNode = graphCtx.storedNodes.peek(node.nodeId);
        return this.inner.exportData(structVal, opts);
      },
    });
  }
  mapIn(newData, graphCtx, node, ...extra) {
    return this.inner.mapIn(newData, graphCtx, node, ...extra);
  }

});

const {inspect} = require('util');
class PredicateAccessor {
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
      //console.log(relation.kind, relation.otherName)
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
    return '[PredicateAccessor]'; // TODO
  }

  attachNode(relation, otherNode) {
    if (!relation.predicate) throw new Error(
      `Can't attach nodes to predicates`);

    //if (relation.direction === 'out') {
      this.graphCtx.newEdge({
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

  attachNewNode(relation, fields, nodeId=null) {
    if (relation.kind !== 'arbitrary') throw new Error(
      `Can't attach new nodes to non-Arbitrary relations`);

    const other = nodeId
      ? this.graphCtx.putNode(relation.otherType, fields, nodeId)
      : this.graphCtx.createNode(relation.otherType, fields);
    //await other.ready;
    this.attachNode(relation, other);
    return other;
  }

  findOneNode(relation, query) {
    //console.log('find one node', relation, query);
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
        objectType: relation.otherName,
      })
      .findOneObject(query);
  }

  fetchNodeList(relation) {
    return this.graphCtx
      .queryGraph({
        subject: this.localNode,
        predicate: relation.predicate,
        objectType: relation.otherName,
      })
      .fetchObjects();
  }
}
