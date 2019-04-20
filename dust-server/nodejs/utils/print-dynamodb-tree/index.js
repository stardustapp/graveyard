const printTree = require('print-tree');
const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient({
  api_version: '2012-08-10',
});

const tablePrefix = 'DustGraph';
const nodeTable = tablePrefix + '_Nodes';
const edgeTable = tablePrefix + '_Edges';

async function run({treeTopId}) {

  const nodeScan = await dynamoDb.scan({
    TableName: nodeTable,
    //FilterExpression: 'Year = :this_year',
    //ExpressionAttributeValues: {':this_year' : 2015},
  }).promise();
  if (nodeScan.LastEvaluatedKey) throw new Error(`Didn't get all nodes`);

  const nodes = new Map;
  let topNode = null;
  for (const record of nodeScan.Items) {
    record.id = `${record.Type}#${record.NodeId}`;
    record.predicates = new Map;
    nodes.set(record.id, record);

    if (record.NodeId === treeTopId)
      topNode = record;
  }

  if (!topNode) throw new Error(
    `Desired top node '${treeTopId}' not found in table`);

  const edgeScan = await dynamoDb.query({
    TableName: edgeTable,
    ExpressionAttributeValues: {
      ':sig': 'spo',
     },
    KeyConditionExpression: 'Signature = :sig',
  }).promise();
  if (edgeScan.LastEvaluatedKey) throw new Error(`Didn't get all edges`);

  const missingNodes = new Set;
  function createFakeNode(id) {
    missingNodes.add(id);
    const [Type, NodeId] = id.split('#');
    const node = {
      id, missing: true,
      NodeId, Type,
      predicates: new Map,
    };
    nodes.set(id, node);
    return node;
  }

  for (const record of edgeScan.Items) {
    const {Signature, ValueList, ...extras} = record;
    if (Signature !== 'spo') throw new Error(
      `unexpected sig ${Signature}`);

    const [subject, predicate, object] = ValueList.split('|');
    const subNode = nodes.get(subject) || createFakeNode(subject);
    const objNode = nodes.get(object) || createFakeNode(object);

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
    const nodeId = `\x1b[${boldChar};33m${node.Type} \x1b[${boldChar};32m${node.NodeId}\x1b[m`;

    if (visited.has(node.id))
      return `${nodeId} \x1b[1;30m(repeat)\x1b[m`;
    visited.add(node.id);

    if (node.missing)
      return `${nodeId} \x1b[1;31;4m(MISSING!)\x1b[m`;

    const values = new Array;
    function searchStruct(struct) {
      for (const key in struct) {
        const value = struct[key];
        if (value == null) {
          values.push(`\x1b[0;34m${value}\x1b[m`);
        } else if (value.constructor === Object) {
          searchStruct(value);
        } else if ([String, Number, Boolean].includes(value.constructor)) {
          values.push(`\x1b[0;36m${value}\x1b[m`);
        }
      }
    }
    searchStruct(node.Fields);

    return `${nodeId} / ${values.join(' / ')}`;
  }

  function visitNodeForKids(node) {
    if (node.predicate)
      return Array.from(node);
    if (visited.has(node.id))
      return [];
    return Array.from(node.predicates.values());
  }

  console.group();
  try {
    printTree(topNode, visitNodeForLabel, visitNodeForKids);
  } finally {
    console.groupEnd();
  }

  if (missingNodes.size > 0) {
    console.log();
    console.log('\x1b[1;31mWARN: \x1b[0;31mencountered', missingNodes.size, 'missing nodes', '\x1b[m');
  }

}

console.log();
run({
  treeTopId: process.argv[2] || 'top',
})
  .catch(err => console.log('\x1b[1;31mCRASH:\x1b[m', err))
  .then(() => console.log())
