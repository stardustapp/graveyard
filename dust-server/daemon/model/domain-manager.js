/*
  const domains = upgradeDB.createObjectStore('domains', {
    keyPath: 'did',
  });
  domains.createIndex('fqdn', 'fqdns', { unique: true,  multiEntry: true });
  domains.createIndex('aid',  'aids',  { unique: false, multiEntry: true });
*/

class DomainManager {

  constructor(idb, accountManager) {
    this.idb = idb;
    this.accountManager = accountManager;
    this.webEnvs = new Map(); // did => env
  }

  async registerDomain(domainName, owner) {
    if (!domainName.match(/(?=^.{1,254}$)(^(?:(?!\d+\.)[a-zA-Z0-9_\-]{1,63}\.?)+(?:[a-zA-Z]{2,})$)/)) {
      throw new Error(`Domain name ${JSON.stringify(domainName)} is not a valid FQDN`);
    }

    const tx = this.idb.transaction('domains', 'readwrite');
    const existing = await tx.objectStore('domains').get(domainName);
    if (existing) {
      await tx.complete;
      throw new Error(`Domain ${existing.domainName} is already registered by ${existing.createdBy} on this server.
          Try logging in if you should have access, or choose another domain.
          TODO: support multiple domain owners :)`);
    }


    const domain = {
      // idb indexes
      did: Math.random().toString(16).slice(2), // for DNS validation too
      fqdns: [domainName],
      aids: [owner.record.aid],

      primaryFqdn: domainName,
      status: 'initial',
      createdBy: owner.address(),
      createdAt: moment().toISOString(),
      grants: [{
        gid: Math.random().toString(16).slice(2),
        aid: owner.record.aid,
        //identity: owner.address(),
        role: 'owner',
      }],
    };
    ToastNotif(`New domain registration: ${domainName} by ${owner.address()}`);

    await tx.objectStore('domains').add(domain);
    await tx.complete;

    return new Domain(domain);
  }

  /*async*/ listDomains() {
    const tx = this.idb.transaction('domains', 'readonly');
    return tx.objectStore('domains').getAll()
      .then(x => x.map(d => new Domain(d)));
  }

  /*async*/ getDomain(domainId) {
    const tx = this.idb.transaction('domains', 'readonly');
    return tx.objectStore('domains').get(domainId)
      .then(d => d ? new Domain(d) : null);
  }

  /*async*/ findDomain(fqdn) {
    const tx = this.idb.transaction('domains', 'readonly');
    return tx.objectStore('domains')
      .index('fqdn').get(fqdn)
      .then(d => d ? new Domain(d) : null);
  }

  /*async*/ getMembershipsFor(account) {
    return this.listDomains().then(list => list
      .filter(d => d.hasGrantFor(account))
      .map(d => {
        return {
          domain: d,
          role: d.highestRoleFor(account),
        };
      }));
  }

  async getWebEnvironment(domain) {
    const {did} = domain.record;
    if (this.webEnvs.has(did)) {
      return this.webEnvs.get(did);
    }

    // register the environment
    const env = new Environment('http://'+domain.record.primaryFqdn);
    this.webEnvs.set(did, env);

    // fill it in
    env.bind('', await domain.getWebrootMount());
    const accounts = await this.accountManager.getAllForDomain(domain);
    accounts.forEach(account => {
      env.bind('/~'+account.record.username, account.webEnv);
    })

    return env;
  }

  async attachStaticWebRoot(domain) {
    const {did} = domain.record;

    const volumeId = `domain:${did}`;
    const webroot = await new Promise((resolve, reject) => {
      chrome.fileSystem.requestFileSystem({
        volumeId, writable: true,
      }, fs => {
        if (chrome.runtime.lastError)
          reject(chrome.runtime.lastError);
        else
          resolve(fs)
      });
    }).then(fs => {
      return {
        type: 'volume',
        id: volumeId,
      };
    }, err => {
      if (!err.message.startsWith("Operation only supported for kiosk apps"))
        throw err;

      // fallback to selectEntry for development
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'select-folder',
          prompt: `webroot for ${domain.record.primaryFqdn}`,
        }, ({ok, id, error}) => {
          if (ok) {
            resolve({
              type: 'retained entry',
              id: id,
            });
          } else {
            reject(new Error(error));
          }
        });
      });
    });

    console.log('got new webroot', webroot);

    const tx = this.idb.transaction('domains', 'readwrite');
    const store = tx.objectStore('domains');

    // make the new version
    const record = await store.get(did);
    record.webroot = webroot;
    domain.record.webroot = webroot;

    // persist it
    await store.put(record);
    await tx.complete;
    ToastNotif(`Web root changed for ${record.primaryFqdn}`);

    // remound the webenv's root if it's already loaded
    if (this.webEnvs.has(did)) {
      console.log('hotswapping web env for domain', did);
      const webEnv = this.webEnvs.get(did);
      webEnv.bind('', await domain.getWebrootMount());
    }

    return webroot;
  }
};
