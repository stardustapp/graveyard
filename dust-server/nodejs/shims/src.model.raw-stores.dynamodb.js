const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

class RawDynamoDBStore extends BaseRawStore {
  constructor(opts) {
    super(opts);

    this.nodeTable = opts.tablePrefix + '_Nodes';
    this.edgeTable = opts.tablePrefix + '_Edges';
  }

  // create a new dbCtx for a transaction
  createDataContext(mode) {
    return new DynamoDBDataContext(this, mode);
  }

  static new(opts) {
    return BaseRawStore.newFromImpl(RawDynamoDBStore, opts);
  }

  async processAction({kind, record}) {
    switch (kind) {

      case 'put node':
        if (!this.accessors.has(record.type)) throw new Error(
          `Can't store unrecognized node type '${record.type}'`);
        if (!record.nodeId) throw new Error(
          `Node ID is required when storing nodes`);

        const data = await dynamoDb.put({
          TableName: this.nodeTable,
          Item: record,
        }).promise();
        console.log(`stored node '${record.nodeId}' in AWS`);
        break;

      case 'put edge':
        const result = await dynamoDb.batchWrite({
          TableName: this.edgeTable,
          RequestItems: {
            [this.edgeTable]: [
              {
                PutRequest: {
                  Item: {
                    prefix: ['spo', record.subject, record.predicate].map(encodeURI).join('|'),
                    suffix: record.object,
                    record,
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    prefix: ['sop', record.subject, record.object].map(encodeURI).join('|'),
                    suffix: record.predicate,
                    record,
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    prefix: ['pso', record.predicate, record.subject].map(encodeURI).join('|'),
                    suffix: record.object,
                    record,
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    prefix: ['pos', record.predicate, record.object].map(encodeURI).join('|'),
                    suffix: record.subject,
                    record,
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    prefix: ['osp', record.object, record.subject].map(encodeURI).join('|'),
                    suffix: record.predicate,
                    record,
                  },
                },
              },
              {
                PutRequest: {
                  Item: {
                    prefix: ['ops', record.object, record.predicate].map(encodeURI).join('|'),
                    suffix: record.subject,
                    record,
                  },
                },
              },
            ]
          }
        }).promise();
        console.log(`stored edge ${record.subject} ${record.predicate} ${record.object} in AWS`);
        console.log(result)
        break;

      default: throw new Error(
        `DynamoDB store got weird action kind '${kind}'`);
    }
    //console.debug('DynamoDB store processed', kind, 'event');
  }
}

class RawDynamoDBNode {
  constructor(type, fields) {
    this.type = type;
    this.fields = fields;
  }

  static fromGraphObject(obj) {
    if (obj.constructor !== GraphObject) throw new Error(
      `fromGraphObject only accepts GraphObjects`);
    return {
      type: obj.type.name,
      fields: JSON.parse(obj.data.toJSON()),
    };
  }
}

class DynamoDBDataContext extends BaseRawContext {

  async loadNodeById(nodeId) {
    const result = await dynamoDb.query({
      TableName: this.graphStore.nodeTable,
      ExpressionAttributeValues: {
        ':nid': nodeId,
       },
      KeyConditionExpression: 'nodeId = :nid',
    }).promise();

    if (result.Count === 1) {
      return result.Items[0];
    } else {
      const myErr = new Error(`DynamoDB store doesn't have node '${nodeId}'`);
      myErr.status = 404;
      throw myErr;
    }
  }

  async flushActions() {
    // TODO
    for (const action of this.actions) {
      console.warn('ignoring volatile action', action);
    }
  }

  async fetchEdges(query) {
    const edges = new Set;
    console.log('querying edge records from',
      this.actions.length, 'actions and also AWS');

    for (const action of this.actions) {
      if (action.kind !== 'put edge') continue;
      if (action.record.predicate !== query.predicate) continue;
      if (query.subject && action.record.subject !== query.subject) continue;
      if (query.object && action.record.object !== query.object) continue;
      edges.add(action.record);
    }

    let prefixParts, suffix;
    switch (true) {
      case !!(query.subject && query.predicate):
        prefixParts = ['spo', query.subject, query.predicate];
        break;
      case !!(query.subject && query.object):
        prefixParts = ['sop', query.subject, query.object];
        break;
      case !!(query.predicate && query.subject):
        prefixParts = ['pso', query.predicate, query.subject];
        break;
      case !!(query.predicate && query.object):
        prefixParts = ['pos', query.predicate, query.object];
        break;
      case !!(query.object && query.subject):
        prefixParts = ['osp', query.object, query.subject];
        break;
      case !!(query.object && query.predicate):
        prefixParts = ['ops', query.object, query.predicate];
        break;
      default:
        throw new Error(`WTF kinda query is that`);
    }
    const prefix = prefixParts.map(encodeURI).join('|');
    //console.log('dynamo edge query:', query, prefix)

    const result = await dynamoDb.query({
      TableName: this.graphStore.edgeTable,
      ExpressionAttributeValues: {
        ':pre': prefix,
       },
      KeyConditionExpression: 'prefix = :pre',
    }).promise();

    console.log('dynamo had', result.Count, 'edges');
    for (const edge of result.Items) {
      edges.add(edge.record);
    }

    return Array.from(edges);
  }
}


if (typeof module !== 'undefined') {
  module.exports = {
    RawDynamoDBStore,
    DynamoDBDataContext,
  };
}
