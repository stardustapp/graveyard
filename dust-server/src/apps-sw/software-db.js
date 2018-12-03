// this switch intentionally falls through every case.
// it allows for each case to build on the previous.

async function MigrateDatabase(upgradeDB) {
  switch (upgradeDB.oldVersion) {
    case 0:
      const packages = upgradeDB.createObjectStore('packages', { keyPath: 'pid' });
      //packages.createIndex('deps', 'deps', { unique: false, multiEntry: true });
      const resources = upgradeDB.createObjectStore('resources', { keyPath: 'rid' });
      resources.createIndex('pid', 'pid', { unique: false });
      resources.createIndex('pidPath', ['pid', 'path'], { unique: true });
      const datums = upgradeDB.createObjectStore('datums', { keyPath: 'did' });
      datums.createIndex('pid', 'pid', { unique: false });
  }
}

const HardCodedDatabaseVersion = 1;
async function OpenSoftwareDatabase() {
  const db = await idb.open('software', HardCodedDatabaseVersion, MigrateDatabase);
  return new SoftwareDatabase(db);
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
    console.log('loaded package', packageId, 'meta:', record);
    return new SoftwarePackage(this, record);
  }

  async listAllPackages() {
    return await this.idb
      .transaction('packages')
      .objectStore('packages')
      .getAll();
  }

  async createPackage(meta) {
    meta.pid = randomString(10);

    const tx = this.idb
      .transaction('packages', 'readwrite');
    tx.objectStore('packages')
      .add(meta);

    await tx.complete;
    return meta;
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
  constructor(sdb, meta) {
    this.sdb = sdb;
    this.meta = meta;
    this.resourceCache = new LoaderCache(this.loadResource.bind(this));
  }

  getResource(path) {
    return this.resourceCache.getOne(path, path);
  }
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