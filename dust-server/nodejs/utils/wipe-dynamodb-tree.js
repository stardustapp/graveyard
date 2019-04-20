const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

const tablePrefix = 'DustGraph';
const nodeTable = tablePrefix + '_Nodes';
const edgeTable = tablePrefix + '_Edges';

async function run() {

  async function deleteSomeNodes() {
    const nodeScan = await dynamoDb.scan({
      TableName: nodeTable,
    }).promise();
    if (nodeScan.LastEvaluatedKey) throw new Error(`Didn't get all nodes`);

    await Promise.all(nodeScan
      .Items.map(({NodeId}) => dynamoDb
        .delete({
          TableName: nodeTable,
          Key: { NodeId },
        }).promise()));
    console.log('Deleted', nodeScan.Items.length, 'nodes');

    if (nodeScan.LastEvaluatedKey)
      return deleteSomeNodes();
  }

  async function deleteSomeEdges() {
    const edgeScan = await dynamoDb.scan({
      TableName: edgeTable,
    }).promise();

    await Promise.all(edgeScan
      .Items.map(({ Signature, ValueList }) => dynamoDb
        .delete({
          TableName: edgeTable,
          Key: { Signature, ValueList },
        }).promise()));
    console.log('Deleted', edgeScan.Items.length, 'edges');

    if (edgeScan.LastEvaluatedKey)
      return deleteSomeEdges();
  }

  await Promise.all([
    deleteSomeNodes(),
    deleteSomeEdges(),
  ]);
}

console.log();
run()
  .catch(err => console.log('\x1b[1;31mCRASH:\x1b[m', err))
  .then(() => console.log())
