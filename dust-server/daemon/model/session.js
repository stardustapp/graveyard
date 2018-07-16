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
        console.debug('session mount:', mount);
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

            } else if (mount.source.startsWith('skylink+') && mount.source.includes('://')) {
              const parts = mount.source.slice('skylink+'.length).split('/');
              await this.env.mount('/mnt'+mount.target, 'network-import', {
                url: parts.slice(0,3).join('/') + '/~~export' + (parts[0].startsWith('ws') ? '/ws' : ''),
                prefix: ('/' + parts.slice(3).join('/')).replace(/\/+$/, ''),
              });

            } else {
              throw new Error(`BUG: Session has unsupported bind source ${mount.source}`);
            }
            // else if (mount.source.includes('://'))
            break;

          case 'device':
            const driver = window[mount.driver+'Driver'];
            if (!driver)
              throw new Error(`Session device called for unregistered class ${mount.driver}Driver`);

            console.log('Building', mount.driver, 'device for', this.account.address());
            const device = new driver(this, mount.input);
            device.ready && await device.ready;
            this.env.bind('/mnt'+mount.target, device);
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
