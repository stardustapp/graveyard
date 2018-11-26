// this switch intentionally falls through every case.
// it allows for each case to build on the previous.

async function MigrateDatabase(upgradeDB) {
  switch (upgradeDB.oldVersion) {
    case 0:
      const repos = upgradeDB.createObjectStore(
        'repos', { keyPath: 'repoId' });
      repos.createIndex('by origin',
        'origin', { unique: false });

      const objects = upgradeDB.createObjectStore(
        'objects', { keyPath: ['repoId', 'objId', 'rev'] });
      objects.createIndex('repo refs',
        'refs', // [repoId, refType, refName]
        { unique: true, multiEntry: true });
  }
}

const HardCodedDatabaseVersion = 1;
async function OpenSoftwareDatabase() {
  const db = await idb.open('software', HardCodedDatabaseVersion, MigrateDatabase);
  return new RepositoryStore(db);
}

class RepositoryStore {
  constructor(db) {
    this.idb = db;
    this.typeCache = new LoaderCache(this.loadType.bind(this));
  }
  async getAllRepositories() {
    const data = await this.idb
      .transaction('repos')
      .objectStore('repos')
      .getAll();
    return data;
  }
  async getRepositoryRef(repoId, refType, refName) {
    const data = await this.idb
      .transaction('objects')
      .objectStore('objects')
      .index('repo refs')
      .get([repoId, refType, refName]);
    return data;
  }
  async initRepository(origin) {
    const tx = this.idb.transaction(['repositories', 'objects'], 'readwrite');
    const record = {
      repoId: randomString(8),
      createdAt: new Date,
      origin: origin,
    };
    tx.objectStore('repositories')
      .add(repoRecord);
    await tx.complete;
    return record;
  }
  async storeObjectRevision({repoId, objType, objId, version, data}) {
    if (!repoId) throw new Error(`No repository ID given`);
    if (!objType) throw new Error(`No object type given`);
    const isNew = objId === null;

    if (isNew) {
      if (version !== null) throw new Error(
        `version cannot be specified when creating an object`);
      objId = randomString(10);
      version = 0;
    }

    const tx = this.idb.transaction('objects', 'readwrite');
    // get overlapping versions
    const existingVersions = await tx
      .objectStore('objects')
      .getAllKeys(IDBKeyRange.bound(
        [repoId, objId, version],
        [repoId, objId, Number.MAX_VALUE]));
    if (isNew && existingVersions.length) throw new Error(
      `Random object ID chosen for new object had existing conflict in repo, try again`);
    if (existingVersions.find(v => v[2] > version)) throw new Error(
      `A newer version of this object already exists in repo, redo your change`);

    const record = {
      repoId, objId, version,
      objType, data,
      createdAt: new Date,
      refs: [],
    };
    this.validateObject(record);

    tx.objectStore('objects')
      .add(record);

    await tx.complete;
    return record;
  }

  validateObject(record) {
    switch (record.objType) {
      case 'Tree':
        console.log('validating tree:', record);
      case 'Resource':
        switch (record.resType) {
          case 'Template':
          case 'Application':
        }
      default:
        console.error(record, type);
        throw new Error(`Unknown Object ${record.objType}`);
    }
  }
}

class DbObject {
  constructor(record) {
    this.record = record;
  }
}

class SoftwareDatabase {
  constructor(db) {
    this.idb = db;
    this.packageCache = new LoaderCache(this.loadPackage.bind(this));
  }

  getPackage(packageId) {
    return this.packageCache.getOne(packageId, packageId);
  }
  async loadPackage(packageId) {
    const record = await this.idb
      .transaction('packages')
      .objectStore('packages')
      .get(packageId);
    if (!record) throw new Error(`Package not found: ${packageId}`);
    console.log('loaded package', record);
    return new SoftwarePackage(this, record);
  }

  async listAllPackages() {
    return await this.idb
      .transaction('packages')
      .objectStore('packages')
      .getAll();
  }

  async createPackage(meta) {
    const record = {
      version: 1,
      pid: randomString(10),
      createdAt: new Date,
      metadata: meta,
      resources: [],
      rids: [],
    };

    const tx = this.idb
      .transaction('packages', 'readwrite');
    tx.objectStore('packages')
      .add(record);

    await tx.complete;
    return record;
  }
}

function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

class SoftwarePackage {
  constructor(sdb, record) {
    this.sdb = sdb;
    this.record = record;
    //this.resourceCache = new LoaderCache(this.loadResource.bind(this));
  }

  //getResource(path) {
    //return this.resourceCache.getOne(path, path);
  //}

  // name.type - within the package
  // package:name.type - from a dep
  // TODO: type guessing:
  // name - within pkg, picks any type, fails if multiple
  async loadResource(path) {
    console.warn('"loading" resource', path, this);
    /*
    console.group? 'Injecting', name

    if ':' in name
      [pkg, subNames...] = name.split(':')
      if val = BUILTINS[pkg]?[subNames[0]]
        console.log 'Using builtin'
        console.groupEnd?()
        return val

      if dependency = @get pkg, 'Dependency'
        innerRes = dependency.fetch subNames.join(':')
        console.groupEnd?()
        return innerRes

      console.groupEnd?()
      throw new Meteor.Error 'not-found',
        "Failed to inject #{name} - builtin does not exist"

    resource = DB.Resource.findOne
      packageId: @packageId
      name: name

    unless resource
      console.groupEnd?()
      throw new Meteor.Error 'not-found',
        "Failed to inject #{name} - name could not be resolved"

    if InjectorTypes.has resource.type
      final = InjectorTypes.get(resource.type).call @, resource
    else
      console.groupEnd?()
      throw new Meteor.Error 'not-implemented',
        "#{name} was a #{resource.type} but I have no recipe for that"

    console.groupEnd?()
    type: resource.type
    source: resource
    final: final
    dep: new Tracker.Dependency
    */
  }
}