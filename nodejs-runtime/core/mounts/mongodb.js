const MongoClient = require('mongodb').MongoClient;

exports.MongoDBMount = class MongoDBMount {
  constructor(opts) {
    this.client = MongoClient.connect.sync(MongoClient, opts.url);
    console.log('Successfully connected to mongodb server');

    this.db = this.client.db(opts.database);
  }

  //sysop(op, params=[]) {
  //  console.log('mongodb got sysop', op, params);
  //}

  getEntry(path) {
    const parts = path.slice(1).split('/');
    switch (true) {
      case parts[0] === 'schemas' && parts.length === 1:
        return new MongoSchemasEntry(this);
      case parts[0] === 'schemas' && parts.length === 2:
        return new MongoSchemaEntry(this, parts[1]);
      default:
        throw new Error(`MongoDB mount doesn't provide ${path}`);
    }
  }

  close() {
    this.client.close();
  }
};

class MongoSchemasEntry {
  constructor(mount) {
    this.mount = mount;
  }

  enumerate() {
    return ['todo'];
  }
}

class MongoSchemaEntry {
  constructor(mount, name) {
    this.mount = mount;
    this.name = name;
  }

  put(spec) {
    console.log('putting spec', spec, 'to', this.name);
    return 'no';
  }
}
