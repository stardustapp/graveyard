class DomainManager {

  constructor(idb) {
    this.env = new Environment();
    this.idb = idb;
    this.domains = new Map();
  }

  async registerDomain(domainName, ownerAddress) {
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
      domainName,
      status: 'pending',
      ownershipToken: Math.random().toString(16).slice(2),
      createdBy: ownerAddress,
      createdAt: moment().toISOString(),
      grants: [{
        grantId: Math.random().toString(16).slice(2),
        identity: ownerAddress,
        role: 'owner',
      }],
    };
    ToastNotif(`New domain registration: ${domainName} by ${ownerAddress}`);

    await tx.objectStore('domains').add(domain);
    await tx.complete;

    return domain;
  }

  /*async*/ listDomains() {
    const tx = this.idb.transaction('domains', 'readonly');
    return tx.objectStore('domains').getAll()
      .then(x => x.map(d => new Domain(d, this)));
  }

  /*async*/ getDomain(domainName) {
    const tx = this.idb.transaction('domains', 'readonly');
    return tx.objectStore('domains').get(domainName)
      .then(d => new Domain(d, this));
  }
};
