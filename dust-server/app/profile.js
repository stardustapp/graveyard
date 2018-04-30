class Profile {

  static async open(chartName) {
    const db = await idb.open('profile:'+chartName, 1, upgradeDB => {
      upgradeDB.createObjectStore('metadata');
      upgradeDB.createObjectStore('persist', {
        keyPath: 'nid',
      });
      upgradeDB.createObjectStore('config', {
        keyPath: 'nid',
      });
    });
    console.log('Opened database for', chartName);

    return new Profile(chartName, db);
  }

  constructor(chartName, db) {
    this.env = new Environment();
    this.chartName = chartName;
    this.db = db;
    console.log('starting profile for', chartName);

    /*
    this.env.mount('/persist', 'bind', { source: { getEntry(path) {
      throw new Error(`TODO: implement /persist for ${path} on ${chartName}`);
    }}});
    */
    this.env.mount('/config', 'arbitrary-idb', { db, store: 'config' });
    this.env.mount('/persist', 'arbitrary-idb', { db, store: 'persist' });
    this.env.mount('/chart-name', 'literal', { string: chartName });
  }

  close() {
    console.log('Closing IDB for', chartName);
    this.db.close();
    this.db = null;
  }

  /*
  // /<sessionId>/mnt/<stuff>
  return {
    enumerate(input) {
      return new FolderLiteral('enumeration', [
        new FolderLiteral(''),
        new StringLiteral('test', '123'),
      ]);
    },
    subscribe(newChannel) { return newChannel.invoke(c => {
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf'),
        new FolderLiteral('entry'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf/body'),
        new StringLiteral('entry', 'yup haha'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf/status'),
        new StringLiteral('entry', 'todo'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Ready'),
      ]));
    })}
  };*/

};
