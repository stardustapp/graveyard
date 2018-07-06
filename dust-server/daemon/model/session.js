class Session {
  constructor(record, account) {
    this.record = record;
    this.account = account;

    console.log('launching session for', account.address());
    this.env = new Environment();
    this.ready = this.loadEnv();

    this.uri = 'skylink+ws://localhost:9237/pub/sessions/'+record.sid;
  }

  async loadEnv() {
    if (this.record.environment) {
      for (const mount of this.record.environment) {
        console.log('session mount:', mount);
        switch (mount.type) {
          case 'bind':
            if (mount.source.startsWith('/')) {
              const device = this.account.env.getSubPathEnv(mount.source);
              this.env.bind('/mnt'+mount.target, device);


            } else if (mount.source.startsWith('platform://')) {
              const parts = mount.source.split('://');
              const pkgRoot = await new Promise(r =>
                chrome.runtime.getPackageDirectoryEntry(r));
              const device = new WebFilesystemMount({
                entry: pkgRoot,
                prefix: `platform/apps/${parts[1]}/`,
              });
              this.env.bind('/mnt'+mount.target, device);

            } else {// else if (mount.source.includes('://'))
              throw new Error(`BUG: Session has unsupported bind source ${mount.source}`);
            }
            break;
            
          default:
            throw new Error(`BUG: Session has weird mount type ${mount.type}`);
        }
      }
      //throw new Error('#TODO');
    } else {
      this.env.bind('/mnt', this.account.env);
      this.env.mount('/chart-name', 'literal', { string: this.account.address() });
    }
  }
};
