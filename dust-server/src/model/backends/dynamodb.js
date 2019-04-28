const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

class RawDynamoDBStore extends BaseBackend {
  constructor(opts) {
    super(opts);

    this.nodeTable = opts.tablePrefix + '_Nodes';
    this.edgeTable = opts.tablePrefix + '_Edges';
  }

  async putNode(nodeId, type, recordData) {
    if (!nodeId) throw new Error(
      `Node ID is required when storing nodes`);
    await dynamoDb.put({
      TableName: this.nodeTable,
      Item: {
        NodeId: nodeId,
        Type: type,
        Data: recordData,
      },
    }).promise();
    console.log(`stored '${type}' node '${nodeId}' in AWS`);
  }
  async fetchNode(nodeId) {
    //const {stack} = new Error;
    const result = await dynamoDb.query({
      TableName: this.nodeTable,
      ExpressionAttributeValues: {
        ':nid': nodeId,
       },
      KeyConditionExpression: 'NodeId = :nid',
    }).promise();

    if (result.Count === 1) {
      const doc = result.Items[0];
      return new StoreNode(this.storeId, {
        nodeId: doc.NodeId,
        type: doc.Type,
      }, doc.Data);
    } else {
      console.warn(`WARN: DynamoDB store doesn't have node '${nodeId}'`);
      return null;
    }
  }

  async putEdge(triple, recordData) {
    const {subject, predicate, object} = triple;
    if (subject.constructor !== String) throw new Error(
      `DynamoDB can't store subject type ${subject.constructor.name}`);
    if (predicate.constructor !== String) throw new Error(
      `DynamoDB can't store predicate type ${predicate.constructor.name}`);
    if (object.constructor !== String) throw new Error(
      `DynamoDB can't store object type ${object.constructor.name}`);

    const edgeVals = {
      spo: [subject, predicate, object],
      sop: [subject, object, predicate],
      pso: [predicate, subject, object],
      pos: [predicate, object, subject],
      osp: [object, subject, predicate],
      ops: [object, predicate, subject],
    };
    const edgeItems = Object.keys(edgeVals)
      .map(Signature => ({
        Signature,
        ValueList: edgeVals[Signature].map(encodeURI).join('|'),
        Data: recordData,
      }));

    await dynamoDb.batchWrite({
      TableName: this.edgeTable,
      RequestItems: {
        [this.edgeTable]: edgeItems.map(x => ({
          PutRequest: { Item: x },
        }))
      },
    }).promise();
    //console.log(`stored edge ${record.subject} ${record.predicate} ${record.object} in AWS`);
  }

  async queryEdges(query) {
    const edges = new Set;

    let signature, values;
    switch (true) {
      case !!(query.subject && query.predicate):
        signature = 'spo';
        values = [query.subject, query.predicate, ''];
        break;
      case !!(query.subject && query.object):
        signature = 'sop';
        values = [query.subject, query.object, ''];
        break;
      case !!(query.predicate && query.subject):
        signature = 'pso';
        values = [query.predicate, query.subject, ''];
        break;
      case !!(query.predicate && query.object):
        signature = 'pos';
        values = [query.predicate, query.object, ''];
        break;
      case !!(query.object && query.subject):
        signature = 'osp';
        values = [query.object, query.subject, ''];
        break;
      case !!(query.object && query.predicate):
        signature = 'ops';
        values = [query.object, query.predicate, ''];
        break;
      default:
        throw new Error(`WTF kinda query is that`);
    }
    const valPrefix = values.map(encodeURI).join('|');

    const result = await dynamoDb.query({
      TableName: this.edgeTable,
      ExpressionAttributeValues: {
        ':sig': signature,
        ':valP': valPrefix,
       },
      KeyConditionExpression: 'Signature = :sig AND begins_with(ValueList, :valP)',
    }).promise();

    // console.log('dynamo edge query', signature, valPrefix,
    //   'matched', result.Count, 'edges');

    return result.Items.map(edge => {
      const {Signature, ValueList, ...extra} = edge;
      const names = ValueList.split('|').map(decodeURI);
      const keyMap = {s: 'subject', p: 'predicate', o: 'object'};
      const record = {
        subject: null,
        predicate: null,
        object: null,
        ...extra,
      };
      names.forEach((name, idx) => {
        record[keyMap[Signature[idx]]] = name;
      });
      return record;
    });
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    RawDynamoDBStore,
  };
}
