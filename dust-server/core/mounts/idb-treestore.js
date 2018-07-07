class NidNotFoundError extends ExtendableError {
  constructor(nid) {
    super(`getNodeByNid('${nid}') didn't find a node`);
    this.nid = nid;
  }
}

class IdbTreestoreMount {
  constructor(opts) {
    console.log('idb treestore inited with', opts);

    this.db = opts.db; // actual instance of opened DB
    this.store = opts.store; // string name

    this.nidSubs = new Map; // of Sets
  }

  async init() {
    const txn = new IdbTransaction(this, 'readwrite');

    // create 'root' node if doesn't exist
    try {
      await txn.getNodeByNid('root');
    } catch (err) {
      if (err.constructor !== NidNotFoundError)
        throw err;
      txn.createNode(new FolderLiteral('root'), 'root');
      console.warn('Seeded IDB mount with root node');
    }

    await txn.innerTxn.complete;
    console.log('Done initing IDB mount', this.store);
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
  unregisterNidNotifs(nid, sub) {
    if (!nid) {
      throw new Error(`BUG: Can't unregister for notifications from ghosts`);
    }
    if (this.nidSubs.has(nid)) {
      const subs = this.nidSubs.get(nid);
      subs.delete(sub);
      if (subs.size === 0) {
        console.log('Nothing is watching nid', nid, 'anymore, removing from nidSubs');
        this.nidSubs.delete(nid);
      }
    }
  }

  async routeNidEvent(nid, event) {
    if (this.nidSubs.has(nid)) {
      const txn = new IdbTransaction(this, 'readonly');
      const subs = this.nidSubs.get(nid);
      subs.forEach(sub => {
        sub.processNidEvent(nid, txn, event);
      });
    }
  }

  unregisterSub(sub) {
    // TODO
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
      return null;
      //throw new Error(`Path ${this.path} doesn't exist, can't be gotten`);
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

  async enumerate(enumer) {
    const txn = new IdbTransaction(this.mount, 'readonly');
    const handle = await txn.walkPath(this.path);
    await handle.current().enumerate(enumer, txn);
  }

  async subscribe(depth, newChannel) {
    return await newChannel.invoke(async c => {
      const sub = new IdbSubscription(this, depth, c);
      await sub.start();
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Ready'),
      ]));
    });
  }
}

// Holds one ongoing IDB transaction,
// and knows how to do tree operations within its context.
class IdbTransaction {
  constructor(mount, mode) {
    this.mount = mount;
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
      throw new NidNotFoundError(nid);
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
  async createNode(literal, forcedNid=null) {
    const newNode = {
      name: literal.Name,
      type: literal.Type,
      nid: forcedNid || Math.random().toString(16).slice(2),
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
    await this.objectStore.add(newNode); // throws if exists
    console.log('Created IDB node:', newNode);
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
      this.txn.mount.routeNidEvent(parent.obj.nid, {
        op: 'remove-child',
        child: oldChild.name,
      });
    }

    parent.obj.children.push([oldChild.name, newNid]);
    await this.txn.objectStore.put(parent.obj);
    this.txn.mount.routeNidEvent(parent.obj.nid, {
      op: 'assign-child',
      child: oldChild.name,
      nid: newNid,
    });
    // TODO: delay events until transaction is completed
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

  enumerate(enumer, txn) {
    return; // ghosts never visit
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

  async enumerate(enumer, txn) {
    // really more worried about seeing the structure here
    const copy = {Type: this.obj.type};
    if (copy.Type === 'String')
      copy.StringValue = this.obj.raw;
    enumer.visit(copy);

    // and recurse...
    if (this.obj.type === 'Folder' && this.obj.children.length > 0 && enumer.canDescend()) {
      for (const [name, nid] of this.obj.children) {
        enumer.descend(name);
        const child = await txn.getNodeByNid(nid);
        await child.enumerate(enumer, txn);
        enumer.ascend();
      }
    }
  }
}


///////////////////////////////////////////
// Experimental subscribe() impl
// Here be dragons!

class IdbSubscription {
  constructor(rootPath, depth, channel) {
    this.rootPath = rootPath;
    this.mount = rootPath.mount;
    this.depth = depth;
    this.channel = channel;

    // If any of these change, we restart the whole sub
    this.parentNids = new Set;
    // IDB-side root node - when this changes, the sub basically restarts
    this.currentNode = null;
    // A copy of the root IdbSubNode sent to the client
    this.rootNode = null;
    // Name->node tree of children, events cascade
    this.nidMap = new Map;
  }

  async start() {
    const txn = new IdbTransaction(this.mount, 'readonly');
    const handle = await txn.walkPath(this.rootPath.path);

    this.currentNode = handle.current();

    // Register the path down to the sub's root node
    this.parentNids = new Set;
    handle.nids
      .filter(nid => nid)
      .forEach(nid => {
        this.mount.registerNidNotifs(nid, this);
        this.parentNids.add(nid);
      });

    if (this.currentNode.constructor === IdbExtantNode) {
      this.rootNode = new IdbSubNode(this.currentNode.nid, '', this.depth);
      await this.rootNode.transmitEntry(this, txn, false);
      console.log('all done initial sync');
    } else {
      console.warn(`Subscription made to ghost entry`, this.rootPath.path);
    }
  }

  reset() {
    // delete everything from the client & clean up
    if (this.rootNode) {
      this.rootNode.retractEntry(this, true);
    }

    // also clean up the path we followed to get there
    this.parentNids.forEach(nid => {
      this.mount.unregisterNidNotifs(nid, this);
    });

    // structure reset
    this.parentNids.clear();
    this.currentNode = null;
    this.rootNode = null;
    this.nidMap.clear();
  }

  registerNidNotifs(nid, node) {
    if (this.nidMap.has(nid)) {
      throw new Error(`NID ${nid} already exists in sub, can't be re-registered`);
    }
    this.nidMap.set(nid, node);
    this.mount.registerNidNotifs(nid, this);
  }
  unregisterNidNotifs(nid) {
    this.nidMap.delete(nid);
    this.mount.unregisterNidNotifs(nid, this);
  }

  async processNidEvent(nid, txn, event) {
    console.log('sub processing NID event', nid, event);
    if (this.parentNids.has(nid)) {
      console.log(`one of sub's parent NIDs changed, resetting`);
      this.reset();
      await this.start();
    } else if (this.nidMap.has(nid)) {
      const node = this.nidMap.get(nid);
      await node.processEvent(this, txn, event);
    }
  }
}

class IdbSubNode {
  constructor(nid, path, height) {
    this.nid = nid;
    this.path = path;
    this.height = height; // remaining levels beneath us
    this.children = new Map; // nid->IdbSubNode
    this.childPrefix = path + (path ? '/' : '');
  }
  
  // given a sub and IDB transaction, recursively send shallow exports to the client
  async transmitEntry(sub, txn, asChanged=false) {
    const node = await txn.getNodeByNid(this.nid);
    sub.registerNidNotifs(node.nid, this);

    // transmit self
    const notifType = asChanged ? 'Changed' : 'Added';
    const entry = node.shallowExport();
    entry.Name = 'entry';
    sub.channel.next(new FolderLiteral('notif', [
      new StringLiteral('type', notifType),
      new StringLiteral('path', this.path),
      entry,
    ]));

    // transmit children if we're not ground-level
    this.children.clear();
    if (node.type === 'Folder' && this.height > 0) {
      for (const child of node.obj.children) {
        const childNode = new IdbSubNode(child[1],
            this.childPrefix+encodeURIComponent(child[0]), this.height - 1);
        this.children.set(child[0], childNode);
        await childNode.transmitEntry(sub, txn, false);
      }
    }
  }

  retractEntry(sub, andRemove) {
    console.log('Retracting IDB node', this.nid, 'path', this.path, 'and remove:', andRemove);
    sub.unregisterNidNotifs(this.nid);

    // remove children first
    this.children.forEach((child, name) => {
      child.unload(state, false);
    });
    this.children.clear();

    if (andRemove) {
      sub.channel.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Removed'),
        new StringLiteral('path', this.path),
      ]));
    }
  }

  // Process events on this nid
  // Currently, the only mutable aspect of a nid 
  async processEvent(sub, txn, event) {
    switch (event.op) {
      case 'remove-child':
        if (this.children.has(event.child)) {
          const child = this.children.get(event.child);
          child.retractEntry(sub, true);
          this.children.delete(event.child);
        }
        break;

      case 'assign-child':
        // only pay attention if we aren't ground-level
        if (this.height > 0) {
          const childNode = new IdbSubNode(event.nid,
              this.childPrefix+encodeURIComponent(event.child), this.height - 1);
          this.children.set(event.child, childNode);
          await childNode.transmitEntry(sub, txn, false);
        }
        break;
      
      default:
        console.warn('idb subnode', this, 'got unimpl event', event);
    }
  }
}
