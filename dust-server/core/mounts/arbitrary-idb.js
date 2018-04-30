
class ArbitraryIdbMount {
  constructor(opts) {
    console.log('arbitrary idb inited with', opts);

    this.db = opts.db; // actual instance of opened DB
    this.store = opts.store; // string name
  }

  async getEntryAsync(path) {
    const txn = this.db.transaction(this.store, 'readwrite'); // TODO: for initing the root
    const store = txn.objectStore(this.store);

    let root = await store.get('root');
    if (!root) {
      console.log('Creating root NID in IDB');
      await store.add({nid: 'root', name: 'root', type: 'Folder', children: []});
      root = await store.get('root');
    }

    const route = [root];
    if (path.length <= 1) {
      return new IdbEntry(path, root, route, txn, store);
    }

    let node = root;
    const parts = path.slice(1).split('/');
    for (const key in parts) {
      const part = parts[key];
      console.log('Pathing', part, 'from', node);
      if (node) {
        if (node.type != 'Folder') {
          throw new Error(`Can't path into folders in IDB`);
        }
        const child = node.children.find(x => x[0] === part);
        if (child) {
          node = await store.get(child[1]);
          route.push(node);
          continue;
        }
      }
      // no node? pathing into emptiness. don't complain tho
      route.push(part);
      node = null;
    }
    return new IdbEntry(path, node, route, txn, store);
  }
};

class IdbEntry {
  constructor(path, node, route, txn, store) {
    this.path = path;
    this.node = node;
    this.route = route;
    this.txn = txn;
    this.store = store;
  }

  async getAsync() {
    await this.txn.complete;
    if (!this.node) {
      throw new Error(`Path ${this.path} doesn't exist, can't be gotten`);
    }

    switch (this.node.type) {
      case 'Folder':
        return new FolderLiteral(this.node.name, this.node.children.map(x => x[0]));
      default:
        throw new Error(`Failed to map IDB type ${this.node.type} to get()`);
    }
  }

  async putAsync(obj) {
    console.log('putting', obj, 'to', this.path);
    const [parentRec, thisRec] = this.route.slice(-2);

    let newNode;

    switch (obj.Type) {
      case 'Folder':
        newNode = {
          name: obj.Name,
          type: 'Folder',
          children: [],
        }
        // TODO: support children
        break;
        
      default:
        throw new Error(`Failed to map IDB type ${this.node.type} for put()`);
    }
    newNode.nid = Math.random().toString(16).slice(2);
    await this.store.add(newNode);

    if (this.node) {
      // we already existed, strip out old entry
      console.log('IDB overwriting', this.path);
      parentRec.children = parentRec.children.filter(x => x[1] !== this.node.nid);
      parentRec.children.push([this.node.name, newNode.nid]);
    } else {
      parentRec.children.push([thisRec, newNode.nid]);
    }
    this.store.put(parentRec);
    await this.txn.complete;
    console.log('created nid', newNode.nid);
    return true;;
  }

  enumerate() {
    return ['todo'];
  }
}
