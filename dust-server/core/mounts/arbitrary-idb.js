class ArbitraryIdbMount {
  constructor(opts) {
    console.log('arbitrary idb inited with', opts);

    this.db = opts.db; // actual instance of opened DB
    this.store = opts.store; // string name

    this.nidSubs = new Map; // of Sets
  }

  async init() {
    // TODO: ensure 'root' nid exists
  }

  async getEntry(path) {
    return new IdbPath(this, path);
  }

  registerNidNotifs(nid, sub) {
    if (!nid) {
      throw new Error(`BUG: Can't register for notifications from ghosts`);
    }
    let subs;
    if (this.nidSubs.has(nid)) {
      subs = this.nidSubs.get(nid);
    } else {
      subs = new Set;
      this.nidSubs.set(nid, subs);
    }
    subs.add(sub);
  }

  processNidEvent(nid, event) {
    
  }
}

// Represents a client pathing into the IDB treestore.
// Uses the treestore API to satisfy operations.
// Doesn't actually know anything.
class IdbPath {
  constructor(mount, path) {
    this.mount = mount;
    this.path = path;
  }

  async get() {
    const txn = new IdbTransaction(this.mount, 'readonly');
    const handle = await txn.walkPath(this.path);

    if (!handle.exists()) {
      throw new Error(`Path ${this.path} doesn't exist, can't be gotten`);
    }
    return handle.current().shallowExport();
  }

  async put(obj) {
    console.log('putting', obj, 'to', this.path);

    const txn = new IdbTransaction(this.mount, 'readwrite');
    const newNid = await txn.createNode(obj);

    const handle = await txn.walkPath(this.path);
    const parent = handle.parent();
    if (!parent.nid) {
      // TODO: implement this like mkdirp?
      console.warn(`Failed to put to ${this.path} because the direct parent doesn't exist`);
      return false;
    }
    await handle.replaceCurrent(txn, newNid);
    await txn.innerTxn.complete;
    return true;
  }

  async enumerate(input) {
    return new FolderLiteral('enumeration', [
      new FolderLiteral(''),
      new StringLiteral('test', '123'),
    ]);
  }
  async subscribe(depth, newChannel) {
    return await newChannel.invoke(async c => {

      const sub = new IdbSubscription(this.mount, c);

      const txn = new IdbTransaction(this.mount, 'readonly');
      const handle = await txn.walkPath(this.path);

      // Register the path down to us
      let exists = true;
      for (const nid of handle.nids) {
        if (nid) {
          this.mount.registerNidNotifs(nid, sub);
        } else {
          exists = false;
        }
      }

      if (exists) {
        await sub.walkEntry(handle, '', depth);
        console.log('all done initial sync');
        c.next(new FolderLiteral('notif', [
          new StringLiteral('type', 'Ready'),
        ]));
      } else {
        console.warn(`Subscription made to ghost entry`);
      }
    });
  }
}

class IdbSubscription {
  constructor(mount, channel) {
    this.mount = mount;
    this.channel = channel;
  }

  async walkEntry(handle, path, depth) {
    const node = handle.current();
    this.mount.registerNidNotifs(node.nid, this);

    const entry = node.shallowExport();
    entry.Name = 'entry';
    this.channel.next(new FolderLiteral('notif', [
      new StringLiteral('type', 'Added'),
      new StringLiteral('path', path),
      entry,
    ]));

    if (node.type === 'Folder' && depth) {
      const pathPrefix = path + (path ? '/' : '');
      for (const child of node.obj.children) {
        await handle.walkName(child[0]);
        await this.walkEntry(handle, pathPrefix+child[0], depth-1);
        await handle.walkName("..");
      }
    }
  }
}

// Holds one ongoing IDB transaction,
// and knows how to do tree operations within its context.
class IdbTransaction {
  constructor(mount, mode) {
    this.innerTxn = mount.db.transaction(mount.store, mode);
    this.objectStore = this.innerTxn.objectStore(mount.store);
  }

  async walkTree() {
    return new IdbHandle(this).init();
  }

  /*async*/ walkPath(path) {
    return this.walkTree()
      .then(x => x.walkPath(path));
  }

  async getNodeByNid(nid) {
    const raw = await this.objectStore.get(nid);
    if (!raw) {
      throw new Error(`getNodeByNid(${nid}) didn't find a node`);
      //return new IdbGhostNode(nid, raw.name, )
    }
    return new IdbExtantNode(nid, raw.name, raw.type, raw);
  }

  // Gets the literal for the node at a particular NID.
  // These are bare Skylink literals and don't know where they are from.
  async getEntryByNid(nid) {
    const node = await this.getNodeByNid(nid);
    switch (node.type) {
      case 'Folder':
        return new FolderLiteral(node.name, node.children);
      case 'String':
        return new StringLiteral(node.name, node.raw);
      default:
        throw new Error(`Failed to map IDB type ${node.type} for getEntryByNid()`);
    }
  }

  // Accepts a Skylink-format literal entry,
  // and stores a sanitized version under an unallocated NID.
  // The transaction must be opened in 'readwrite' mode.
  // The new NID is returned.
  async createNode(literal) {
    const newNode = {
      name: literal.Name,
      type: literal.Type,
      nid: Math.random().toString(16).slice(2),
    }
    switch (literal.Type) {
      case 'Folder':
        // recursively store children too
        newNode.children = [];
        for (const child of literal.Children) {
          if (!child.Type) {
            throw new Error(`A nested child in a Folder didn't have a Type`);
          }
          const childNid = await this.createNode(child);
          newNode.children.push([child.Name, childNid]);
        }
        break;

      case 'String':
        newNode.raw = literal.StringValue || '';
        break;
        
      default:
        throw new Error(`Failed to map IDB type ${this.node.type} for createNode()`);
    }
    await this.objectStore.add(newNode);
    return newNode.nid;
  }
}

// Kinda like a raytracer but for tree nodes, starting from the root node
class IdbHandle {
  constructor(txn) {
    this.txn = txn;
    this.nids = []
    this.stack = [];
  }
  async init() {
    this.nids = ['root'];
    this.stack = [await this.txn.getNodeByNid('root')];
    return this;
  }

  // Helpers to work with the stack
  current() {
    return this.stack[this.stack.length - 1];
  }
  exists() {
    return this.current().constructor === IdbExtantNode;
  }
  parent() {
    if (this.stack.length === 1)
      return this.current();
    return this.stack[this.stack.length - 2];
  }
  root() {
    return this.stack[0];
  }

  // Returns this, for chaining.
  async walkPath(path) {
    // reset when given an absolute path
    if (path.startsWith('/')) {
      this.stack = [this.root()];
      this.nids = ['root'];
      path = path.slice(1);
    }
    if (!path.length) {
      return this;
    }

    // walk on down
    const parts = path.split('/');
    for (const key in parts) {
      const part = decodeURIComponent(parts[key]);
      console.log('Pathing', part, 'from', this.stack);
      await this.walkName(part);
    }
    
    return this;
  }

  // Returns whether or not the name exists.
  // The walk is completed either way, using ghosts.
  async walkName(name) {
    // Do these help or hurt?
    if (name == '.') return;
    if (name == '..') {
      if (this.stack.length > 1) {
        this.stack.pop();
        this.nids.pop();
      }
      return;
    }

    const current = this.current();
    if (current.constructor === IdbExtantNode) {
      if (current.type != 'Folder') {
        throw new Error(`Can't path into ${current.type} type entries in IDB`);
      }
      const child = current.obj.children.find(x => x[0] === name);
      if (child) {
        this.stack.push(await this.txn.getNodeByNid(child[1]));
        this.nids.push(child[1]);
        return true;
      }
    }

    // no node? pathing into emptiness. don't complain tho
    this.stack.push(new IdbGhostNode(name));
    this.nids.push('');
    return false;
  }

  async replaceCurrent(txn, newNid) {
    if (this.stack.length < 2) {
      throw new Error(`Can't replace the root node`);
    }
    const oldChild = this.current();
    const parent = this.parent();
    
    if (parent.constructor !== IdbExtantNode) {
      throw new Error(`Can't replace node, parent is not extant`);
    }
    this.stack.pop();
    this.nids.pop();

    if (oldChild.constructor === IdbExtantNode) {
      console.log('IDB overwriting', this.path);
      parent.obj.children = parent.obj.children
          .filter(x => x[1] !== oldChild.nid);
    }

    parent.obj.children.push([oldChild.name, newNid]);
    await this.txn.objectStore.put(parent.obj);
    this.txn.mount.processNidEvent(parent.obj.nid, {
      op: 'assign-child',
      child: oldChild.name,
      nid: newNid,
    });
    await this.walkName(oldChild.name);
  }
}

class IdbNode {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
}

// Represents an entry that doesn't _really_ exist, but could be created
class IdbGhostNode extends IdbNode {
  constructor(name) {
    super(name, 'Ghost');
  }

  shallowExport() {
    throw new Error(`Unable to export ghosts! For '${this.name}'.shallowExport()`);
  }
}

// Represents a real node which actually exists in the store.
// Doesn't know how to do anything
class IdbExtantNode extends IdbNode {
  constructor(nid, name, type, obj) {
    super(name, type);
    this.nid = nid;
    this.obj = obj;
  }

  shallowExport() {
    switch (this.obj.type) {
      case 'Folder':
        return new FolderLiteral(this.obj.name, this.obj.children.map(x => ({Name: x[0]})));
      case 'String':
        return new StringLiteral(this.obj.name, this.obj.raw);
      default:
        throw new Error(`Failed to map IDB type ${this.obj.type} for '${this.name}'.shallowExport()`);
    }
  }
}
