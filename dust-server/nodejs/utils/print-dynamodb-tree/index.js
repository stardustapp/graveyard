const printTree = require('print-tree');
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

const tablePrefix = 'DustGraph';
const nodeTable = tablePrefix + '_Nodes';
const edgeTable = tablePrefix + '_Edges';

(async function() {

  const nodeScan = await dynamoDb.scan({
    TableName: nodeTable,
    //FilterExpression: 'Year = :this_year',
    //ExpressionAttributeValues: {':this_year' : 2015},
  }).promise();
  if (nodeScan.LastEvaluatedKey) throw new Error(`Didn't get all nodes`);

  const nodes = new Map;
  let topNode = null;
  for (const record of nodeScan.Items) {
    record.id = `${record.type}#${record.nodeId}`;
    record.predicates = new Map;
    nodes.set(record.id, record);

    if (record.nodeId === 'top')
      topNode = record;
  }

  const edgeScan = await dynamoDb.query({
    TableName: edgeTable,
    ExpressionAttributeValues: {
      ':sig': 'spo',
     },
    KeyConditionExpression: 'signature = :sig',
  }).promise();
  if (edgeScan.LastEvaluatedKey) throw new Error(`Didn't get all edges`);

  for (const record of edgeScan.Items) {
    const {signature, keyList, ...extras} = record;
    const [subject, predicate, object] = keyList.split('|');
    const subNode = nodes.get(subject);
    const objNode = nodes.get(object);

    if (!subNode.predicates.has(predicate)) {
      const set = new Set;
      set.predicate = predicate;
      subNode.predicates.set(predicate, set);
    }

    subNode.predicates.get(predicate).add({
      ...objNode,
      ...extras,
    });
  }

  const visited = new Set;
  function visitNodeForLabel(node) {
    if (node.predicate)
      return `\x1b[1;34m${node.predicate}\x1b[m`;

    const boldChar = visited.has(node.id) ? '0' : '1';
    const nodeId = `\x1b[${boldChar};33m${node.type} \x1b[${boldChar};32m${node.nodeId}\x1b[m`;

    if (visited.has(node.id))
      return `${nodeId} \x1b[1;30m(repeat)\x1b[m`;
    visited.add(node.id);

    return `${nodeId} ${JSON.stringify(node.data)}`;
  }

  function visitNodeForKids(node) {
    if (node.predicate)
      return Array.from(node);
    if (visited.has(node.id))
      return [];
    return Array.from(node.predicates.values());
  }

  printTree(topNode, visitNodeForLabel, visitNodeForKids);
})();
