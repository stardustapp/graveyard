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
    switch (path) {
      case '/schemas':
        return new MongoSchemasEntry(this);
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
