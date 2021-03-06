class NidNotFoundError extends ExtendableError {
  constructor(nid) {
    super(`getNodeByNid('${nid}') didn't find a node`);
    this.nid = nid;
  }
}

class IdbTreestoreMount {
  constructor(opts) {
    console.debug('idb treestore inited for', opts.store);

    this.db = opts.db; // actual instance of opened DB
    this.store = opts.store; // string name

    this.nidSubs = new Map; // of Sets
    this.ready = this.init();
  }

  metricTags(tags={}) {
    tags.db = this.db.name;
    tags.store = this.store;
    tags.treeroot = `idb-${this.db.name}-${this.store}`;
    return tags;
  };

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

    // tally state with full grain
    setInterval(() => {
      Datadog.Instance.gauge('idbtree.reactivity.active_nodes',
          this.nidSubs.size, this.metricTags());
    }, 10*1000);

    // tally nodes hourly
    setInterval(async () => {
      const typeMap = await this.tallyAllNodeTypes();
      for (const [type, count] of typeMap) {
        Datadog.Instance.gauge('idbtree.total_nodes',
            count, this.metricTags({entryType: type}));
      }
    }, 1 * 60 * 60 * 1000);

    // GC twice a day
    setInterval(this.collectGarbage.bind(this), 12 * 60 * 60 * 1000);

    await txn.innerTxn.complete;
    console.debug('Done initing IDB mount', this.store);
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
        this.nidSubs.delete(nid);
      }
    }
  }

  async routeNidEvent(nid, event) {
    Datadog.Instance.count('idbtree.reactivity.triggered_events', 1, this.metricTags({nidOp: event.op}));
    console.log('nid event', nid, event);

    if (this.nidSubs.has(nid)) {
      const txn = new IdbTransaction(this, 'readonly');
      const subs = this.nidSubs.get(nid);
      subs.forEach(sub => {
        sub.processNidEvent(nid, txn, event);
      });
    }
  }

  async tallyAllNodeTypes() {
    const self = this;
    const types = new Map;
    function countType(n) {
      types.set(n.type, (types.get(n.type) || 0) + 1);
    }

    const tx = this.db.transaction(this.store, 'readonly');
    await tx.objectStore(this.store)
      .openCursor()
      .then(function cursorIterate(cursor) {
        if (!cursor) return;
        countType(cursor.value);
        return cursor.continue().then(cursorIterate);
      });
    return types;
  }

  async collectGarbage() {
    if (this.isCollectingGarbage)
      throw new Error(`Already collecting garbage, won't do it in parallel!`);
    this.isCollectingGarbage = true;
    console.log('Collecting garbage...');

    const allNids = await this.gcListAllNids();
    const rootTree = await this.gcWalkTreeNids();
    const orphans = await this.gcFilterWithTree(allNids, rootTree);
    await this.gcDeleteOrphans(orphans);

    console.log('Done collecting garbage');
    this.isCollectingGarbage = false;
  }

  async gcListAllNids() {
    const nids = new Set;
    const tx = this.db.transaction(this.store, 'readonly');
    await tx.objectStore(this.store)
      .openCursor()
      .then(function cursorIterate(cursor) {
        if (!cursor) return;
        nids.add(cursor.value.nid);
        return cursor.continue().then(cursorIterate);
      });
    console.log('gc scanned', nids.size, 'nids in store');
    return nids;
  }

  async gcWalkTreeNids() {
    const nids = new Set;
    const txn = new IdbTransaction(this, 'readonly');
    const readTree = async (nid) => {
      nids.add(nid);
      const node = await txn.getNodeByNid(nid);
      if (node.type === 'Folder') {
        for (const [childName, childNid] of node.obj.children) {
          if (nids.has(childNid)) continue;
          await readTree(childNid);
        }
      }
    }
    await readTree('root');
    console.log('gc walked', nids.size, 'nids in tree');
    return nids;
  }

  gcFilterWithTree(allNids, goodNids) {
    const badNids = new Set;
    for (const nid of allNids) {
      if (!goodNids.has(nid))
        badNids.add(nid);
    }
    console.log('gc found', badNids.size, 'orphans in store');
    return badNids;
  }

  async gcDeleteOrphans(nids) {
    const tx = this.db.transaction(this.store, 'readwrite');
    const store = tx.objectStore(this.store);
    for (const nid of nids) {
      store.delete(nid);
    }
    await tx.complete;
    Datadog.Instance.count('idbtree.deleted_nodes', nids.size, this.metricTags());
    console.log('gc deleted', nids.size, 'nodes');
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
      //return null;
      throw new Error(`Path ${this.path} doesn't exist, can't be gotten`);
    }
    return handle.current().shallowExport();
  }

  async put(obj) {
    // TODO: better, centralized place for this logic
    if (obj && obj.Type === 'Blob') {
      obj.Blob = await obj.asRealBlob();
    }

    const txn = new IdbTransaction(this.mount, 'readwrite');
    const newNid = (obj === null) ? null : await txn.createNode(obj);

    const handle = await txn.walkPath(this.path);
    const parent = handle.parent();
    if (!parent.nid) {
      // TODO: implement this like mkdirp?
      throw new Error(`Failed to put to ${this.path} because the direct parent doesn't exist`);
    }

    await handle.replaceCurrent(txn, newNid);
    await txn.innerTxn.complete;
  }

  async enumerate(enumer) {
    const txn = new IdbTransaction(this.mount, 'readonly');
    const handle = await txn.walkPath(this.path);
    await handle.current().enumerate(enumer, txn);
  }

  async subscribe(depth, newChannel) {
    return await newChannel.invoke(async c => {
      // bind a new sub to the channel
      const sub = new IdbSubscription(this, depth, c);
      c.onStop(sub.stop.bind(sub));

      // send the initial state
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
    Datadog.Instance.count('idbtree.reactivity.created_txns', 1, this.mount.metricTags({idbMode: mode}));
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
    return node.shallowExport();
  }

  makeRandomNid() {
    let nid = Math.random().toString(16).slice(2);

    // pad out nid if it ended in zeroes
    if (nid.length >= 13) return nid;
    return nid + new Array(14 - nid.length).join('0');
  }

  // Accepts a Skylink-format literal entry,
  // and stores a sanitized version under an unallocated NID.
  // The transaction must be opened in 'readwrite' mode.
  // The new NID is returned.
  async createNode(literal, forcedNid=null) {
    Datadog.Instance.count('idbtree.created_nodes', 1, this.mount.metricTags({entryType: literal.Type}));

    const newNode = {
      name: literal.Name,
      type: literal.Type,
      nid: forcedNid || this.makeRandomNid(),
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

      case 'Blob':
        // 'Blob' is added before createNode (since async)
        newNode.raw = literal.Blob;
        break;

      default:
        throw new Error(`Failed to map IDB type ${literal.Type} for createNode()`);
    }
    await this.objectStore.add(newNode); // throws if exists
    return newNode.nid;
  }
}

// Kinda like a raytracer but for tree nodes, starting from the root node
class IdbHandle {
  constructor(txn) {
    this.txn = txn;
    this.nids = new Array;
    this.stack = new Array;
    this.names = new Array;
  }
  async init() {
    this.nids = ['root'];
    this.stack = [await this.txn.getNodeByNid('root')];
    this.names = [''];
    return this;
  }

  // Helpers to work with the stack
  current() {
    return this.stack[this.stack.length - 1];
  }
  currentName() {
    return this.names[this.stack.length - 1];
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
      this.names = [''];
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
        this.names.pop();
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
        this.names.push(name);
        return true;
      }
    }

    // no node? pathing into emptiness. don't complain tho
    this.stack.push(new IdbGhostNode(name));
    this.nids.push('');
    this.names.push(name);
    return false;
  }

  async replaceCurrent(txn, newNid) {
    if (this.stack.length < 2) {
      throw new Error(`Can't replace the root node`);
    }
    const oldChild = this.current();
    const childName = this.currentName();
    const parent = this.parent();

    if (parent.constructor !== IdbExtantNode) {
      throw new Error(`Can't replace node, parent is not extant`);
    }
    this.stack.pop();
    this.nids.pop();
    this.names.pop();

    if (oldChild.constructor === IdbExtantNode && newNid) {
      //console.log('IDB overwriting', this.names.join('/'), childName);
      parent.obj.children = parent.obj.children
          .filter(x => x[1] !== oldChild.nid);
      parent.obj.children.push([childName, newNid]);
      this.txn.mount.routeNidEvent(parent.obj.nid, {
        op: 'replace-child',
        child: childName,
        oldNid: oldChild.nid,
        nid: newNid,
      });

    } else {
      if (oldChild.constructor === IdbExtantNode) {
        //console.log('IDB removing', this.names.join('/'), childName);
        parent.obj.children = parent.obj.children
            .filter(x => x[1] !== oldChild.nid);
        this.txn.mount.routeNidEvent(parent.obj.nid, {
          op: 'remove-child',
          child: childName,
          oldNid: oldChild.nid,
        });
      }

      if (newNid) {
        parent.obj.children.push([childName, newNid]);
        this.txn.mount.routeNidEvent(parent.obj.nid, {
          op: 'assign-child',
          child: childName,
          nid: newNid,
        });
      }
    }
    await this.txn.objectStore.put(parent.obj);

    // TODO: delay events until transaction is completed
    await this.walkName(childName);
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
      case 'Blob':
        return makeBlobLiteralFromActual(this.obj.name, this.obj.raw);
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
      const children = await Promise.all(this.obj
        .children.map(([name, nid]) =>
          txn.getNodeByNid(nid)
            .then(node => [name, node])));

      for (const [name, child] of children) {
        enumer.descend(name);
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

    // If the path from the parent to us changes, we restart the whole sub
    this.parentNids = new Set;
    this.parentStack = new Array;
    this.parentNames = new Array;
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
    this.parentStack = handle.stack;
    this.parentNames = handle.names;
    handle.nids
      .filter(nid => nid)
      .forEach(nid => {
        this.mount.registerNidNotifs(nid, this);
        this.parentNids.add(nid);
      });

    if (this.currentNode.constructor === IdbExtantNode) {
      this.rootNode = new IdbSubNode(this.currentNode.nid, '', this.depth);
      await this.rootNode.transmitEntry(this, txn, false);
    }
  }

  reset(andRemove=true) {
    // delete everything from the client & clean up
    if (this.rootNode) {
      this.rootNode.retractEntry(this, andRemove);
    }
    this.rootNode = null;

    // also clean up the path we followed to get there
    this.parentNids.forEach(nid => {
      this.mount.unregisterNidNotifs(nid, this);
    });

    // structure reset
    this.parentStack.length = [];
    this.parentNames.length = [];
    this.parentNids.clear();
    this.currentNode = null;
    this.nidMap.clear();
  }

  stop(reason) {
    console.log('stopping IDB subscription due to', reason);
    this.reset(false); // don't send anything further
    this.channel.done();
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
    //console.debug('sub processing NID event', nid, event);

    if (this.changesParentStack(nid, event)) {
      console.log(`one of sub's parent NIDs changed, resetting`, nid);
      this.reset();
      await this.start();

    } else if (this.nidMap.has(nid)) {
      const node = this.nidMap.get(nid);
      await node.processEvent(this, txn, event);
    }
  }

  changesParentStack(nid, event) {
    if (!this.parentNids.has(nid)) return false;
    for (let idx = 0; idx < this.parentStack.length - 1; idx++) {
      const parent = this.parentStack[idx];
      const childName = this.parentNames[idx+1];
      if (parent.nid === nid && childName === event.child) return true;
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
    const entry = await node.shallowExport();
    entry.Name = 'entry';
    delete entry.Children;
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

  retractEntry(sub, andRemove=true) {
    sub.unregisterNidNotifs(this.nid);

    // remove children first
    this.children.forEach((child, name) => {
      child.retractEntry(sub, false);
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
  // Currently, the only mutable aspect of a nid is a Folder's child listing
  async processEvent(sub, txn, event) {
    // only pay attention if we aren't ground-level
    // (if we are, the sub itself will just restart)
    if (this.height <= 0) return;

    switch (event.op) {
      case 'remove-child':
      this.abandonChild(sub, event.child, true);
      break;

    // We don't want to break the sub state based on existing children being wrong,
    // so these actions are effectively handled the same way
    case 'assign-child':
    case 'replace-child':
      const alreadyExists = this.abandonChild(sub, event.child, false);

      const childNode = new IdbSubNode(event.nid,
          this.childPrefix+encodeURIComponent(event.child), this.height - 1);
      this.children.set(event.child, childNode);
      await childNode.transmitEntry(sub, txn, alreadyExists);
      break;

      default:
        console.warn('idb subnode', this, 'got unimpl event', event);
    }
  }

  // @return true if child was present
  abandonChild(sub, name, andRetract) {
    if (this.children.has(name)) {
      const child = this.children.get(name);
      child.retractEntry(sub, andRetract);
      this.children.delete(name);
      return true;
    }
  }
}

async function makeBlobLiteralFromActual(name, blob) {
  var reader = new FileReader();
  const base64 = await new Promise((resolve, reject) => {
    reader.onloadend = function(evt) {
      if (this.error)
        return reject(this.error);
      const dataIdx = this.result.indexOf(',')+1;
      resolve(this.result.slice(dataIdx));
    };
    reader.readAsDataURL(blob);
  });
  return new BlobLiteral(name, base64, blob.type);
}
