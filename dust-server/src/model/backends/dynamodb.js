const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

class RawDynamoDBStore extends BaseRawStore {
  constructor(opts) {
    super(opts);

    this.nodeTable = opts.tablePrefix + '_Nodes';
    this.edgeTable = opts.tablePrefix + '_Edges';
  }

  async processAction({kind, record}) {
    switch (kind) {

      case 'put node':
        if (!this.accessors.has(record.nodeType)) throw new Error(
          `Can't store unrecognized node type '${record.nodeType}'`);
        if (!record.nodeId) throw new Error(
          `Node ID is required when storing nodes`);

        const {nodeType, nodeId, data} = record;
        await dynamoDb.put({
          TableName: this.nodeTable,
          Item: {
            NodeId: nodeId,
            Type: nodeType,
            Fields: data,
          },
        }).promise();
        //console.log(`stored node '${record.nodeId}' in AWS`);
        break;

      case 'put edge':
        const {subject, predicate, object, ...extra} = record;
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
            ...extra,
          }));

        if (record.subject.constructor !== String) throw new Error(
          `DynamoDB can't store subject type ${record.subject.constructor.name}`);
        if (record.object.constructor !== String) throw new Error(
          `DynamoDB can't store object type ${record.object.constructor.name}`);

        const result = await dynamoDb.batchWrite({
          TableName: this.edgeTable,
          RequestItems: {
            [this.edgeTable]: edgeItems.map(x => ({
              PutRequest: { Item: x },
            }))
          },
        }).promise();
        //console.log(`stored edge ${record.subject} ${record.predicate} ${record.object} in AWS`);
        break;

      default: throw new Error(
        `DynamoDB store got weird action kind '${kind}'`);
    }
    //console.debug('DynamoDB store processed', kind, 'event');
  }

  async loadNodeById(nodeId) {
    const {stack} = new Error;
    const result = await dynamoDb.query({
      TableName: this.nodeTable,
      ExpressionAttributeValues: {
        ':nid': nodeId,
       },
      KeyConditionExpression: 'NodeId = :nid',
    }).promise();

    if (result.Count === 1) {
      const {NodeId, Type, Fields} = result.Items[0];
      return {
        nodeId: NodeId,
        nodeType: Type,
        data: Fields,
      };
    } else {
      const myErr = new Error(`DynamoDB store doesn't have node '${nodeId}'`);
      myErr.status = 404;
      myErr.stack = [
        `${myErr.constructor.name}: ${myErr.message}`,
        ...stack.split('\n').slice(2),
      ].join('\n');
      throw myErr;
    }
  }

  async fetchEdges(query) {
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
