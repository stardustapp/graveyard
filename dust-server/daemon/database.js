// this switch intentionally falls through every case.
// it allows for each case to build on the previous.

async function MigrateDatabase(upgradeDB) {
  switch (upgradeDB.oldVersion) {
    case 0:
      // Stores name[@domain] profiles
      // Domainless profiles are 'local' users
      // These can be for remote users eventually
      upgradeDB.createObjectStore('profiles', {
        keyPath: 'chartName',
      });
    case 3:
      // Stores authoritative records of domains
      upgradeDB.createObjectStore('domains', {
        keyPath: 'domainName',
      });
    case 4:
      upgradeDB.deleteObjectStore('profiles');
      // name@domain accounts
      upgradeDB.createObjectStore('accounts', {
        keyPath: ['username', 'domain'],
      });
      // uniquely IDd sessions for users
      upgradeDB.createObjectStore('sessions', {
        keyPath: 'id',
      }).createIndex('accounts', ['username', 'domain']);
    case 5:
      // ugh let's just start over
      upgradeDB.deleteObjectStore('sessions');
      upgradeDB.deleteObjectStore('accounts');
      upgradeDB.deleteObjectStore('domains');

      const accounts = upgradeDB.createObjectStore('accounts', {
        keyPath: 'aid',
      });
      accounts.createIndex('address', ['username', 'domain'], { unique: true });

      const sessions = upgradeDB.createObjectStore('sessions', {
        keyPath: 'sid',
      });
      sessions.createIndex('aid',      'aid',      { unique: false });
      sessions.createIndex('lastUsed', 'lastUsed', { unique: false });

      const domains = upgradeDB.createObjectStore('domains', {
        keyPath: 'did',
      });
      domains.createIndex('fqdn', 'fqdns', { unique: true,  multiEntry: true });
      domains.createIndex('aid',  'aids',  { unique: false, multiEntry: true });

    case 6:
      const packages = upgradeDB.createObjectStore('packages', {
        keyPath: 'pid',
      });
      upgradeDB.transaction.objectStore('accounts')
          .createIndex('pid',  'pids',  { unique: false, multiEntry: true });
      upgradeDB.transaction.objectStore('accounts')
          .createIndex('did',  'did',   { unique: false });

    case 7:
      const workloads = upgradeDB.createObjectStore('workloads', {
        keyPath: 'wid',
      });
      workloads.createIndex('aidApp', ['aid', 'appKey'], { unique: false });
      workloads.createIndex('didApp', ['did', 'appKey'], { unique: false });
      workloads.createIndex('type',    'type',           { unique: false });

    case 8:
      upgradeDB.transaction.objectStore('workloads')
          .deleteIndex('type');
      upgradeDB.transaction.objectStore('workloads')
          .createIndex('type', 'spec.type', { unique: false });
  }
}

function OpenSystemDatabase() {
  return idb.open('system', 9, MigrateDatabase);
}