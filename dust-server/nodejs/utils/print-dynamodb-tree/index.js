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
      return `${nodeId} \x1b[1;31;4;3m(MISSING!)\x1b[m`; // 4=bold 3=italic

    function printValue(key, value, values) {
      if (value == null) {
        //values.push(`\x1b[0;35;9m${key}\x1b[m`); // 9=strikethrough
      } else if (value.constructor === Object) {
        searchStruct(value, values);
      } else if (value.constructor === Array) {
        const items = value.map(subValue => {
          const subValues = new Array;
          printValue(key, subValue, subValues);
          return subValues.join(' / ');
        });
        values.push(`\x1b[0m${key} \x1b[0;1m[\x1b[m ${items.join(' , ')} \x1b[1m]\x1b[m`);
      } else if (value.constructor === String) {
        if (value.startsWith('{"')) { // JSON heuristic
          const subValues = new Array;
          searchStruct(JSON.parse(value), subValues);
          values.push(`\x1b[0;33m${key} \x1b[1;33m{ ${subValues.join(' / ')} \x1b[1;33m}\x1b[m`);
        } else {
          const escaped = value.replace(/\n/g, '\\n');
          const sliced = `${escaped.slice(0, 32)}...`;
          const final = sliced.length < escaped.length ? sliced : escaped;
          values.push(`\x1b[0;32m${final}\x1b[m`);
        }
      } else if (value.constructor === Boolean) {
        if (value)
          values.push(`\x1b[0;36m${key}\x1b[m`);
      } else if ([Boolean, Number, Boolean].includes(value.constructor)) {
        values.push(`\x1b[0;36m${value}\x1b[m`);
      } else {
        values.push(`\x1b[0;33m${value.constructor.name}\x1b[m`);
      }
    }
    function searchStruct(struct, values) {
      for (const key in struct) {
        const value = struct[key];
        printValue(key, value, values);
      }
    }
    const topValues = new Array;
    topValues.push(nodeId);
    searchStruct(node.Fields, topValues);
    return topValues.join(' / ');
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
