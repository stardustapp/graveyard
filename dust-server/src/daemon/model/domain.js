// meeseeks class for working with domain snapshots
Domain = class Domain {
  constructor(data) {
    this.record = data;
  }

  hasGrantFor(account) {
    return this.record.grants
        .some(g => g.aid === account.record.aid);
  }

  highestRoleFor(account) {
    const roles = new Set;
    this.record.grants
      .filter(g => g.aid === account.record.aid)
      .forEach(g => roles.add(g.role));

    return [
      'owner',
      'manager',
      'user',
      'guest',
    ].find(x => roles.has(x));
  }

  async getWebrootMount() {
    if (this.record.webroot) {
      return await new Promise((resolve, reject) => {
        switch (this.record.webroot.type) {
          case 'retained entry':
            chrome.fileSystem.restoreEntry(this.record.webroot.id, entry => {
              if (chrome.runtime.lastError)
                reject(chrome.runtime.lastError);
              else
                resolve(new WebFilesystemMount({entry}));
            });
            break;
          case 'filesystem':
            chrome.fileSystem.requestFileSystem({
              volumeId, writable: true,
            }, entry => {
              if (chrome.runtime.lastError)
                reject(chrome.runtime.lastError);
              else
                resolve(new WebFilesystemMount({entry}));
            });
            break;
          default:
            reject(new Error(`Domain had unrecognized webroot type ${this.record.webroot}`));
        }
      });
    } else {
      return new DefaultSite(this.record.primaryFqdn);
    }
  }
}
