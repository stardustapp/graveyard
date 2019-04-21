const {inspect} = require('util');

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


if (typeof module !== 'undefined') {
  module.exports = {
    RelationAccessor,
  };
}
