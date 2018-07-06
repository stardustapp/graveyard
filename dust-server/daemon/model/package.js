class Package {
  constructor(record) {
    this.record = record;
    this.webroot = null;
    this.ready = this.load();
  }

  async load() {
    console.log('Loading package', this.record);

    if (this.record.sourceUri.startsWith('platform://')) {
      const parts = this.record.sourceUri.split('://');
      const pkgRoot = await new Promise(r =>
        chrome.runtime.getPackageDirectoryEntry(r));
      this.webroot = new WebFilesystemMount({
        entry: pkgRoot,
        prefix: `platform/apps/${parts[1]}/webroot/`,
      });
    } else {
      throw new Error(`Package used unrecognized source ${this.record.sourceUri}`);
    }
  }

  createAppInstall(appKey, opts) {
    if (!appKey.match(/^[a-z][a-z0-9]+$/i)) {
      throw new Error(`App keys must be alphanumeric`);
    }
    console.log('creating app', appKey, 'from package', this.record.displayName);

    // Start with literally just the source code
    const mounts = [
      {
        type: 'bind',
        target: '/source',
        source: this.record.sourceUri,
      },
    ];

    for (const mountPoint in this.record.mounts) {
      const mountDef = this.record.mounts[mountPoint];
      console.log(mountPoint, mountDef);
      switch (mountDef.type) {
        case 'scoped':
          // Scoped is supposed to be private to the specific application, by appKey
          // We just allow these by default
          if (!['config', 'persist'].includes(mountDef.flavor)) {
            throw new Error(`Package used unrecognized scoped-mount flavor "${mountDef.flavor}"`);
          }
          mounts.push({
            type: 'bind',
            target: mountPoint,
            source: `/${mountDef.flavor}/${appKey}`,
          });
          break;
        case 'bind':
          // Bind is to receive arbitrary entries from the user's environment or the world, as input
          // The user must explicitly allow the path because they are allowing data access
          const fieldKey = `mount-${encodeURIComponent(mountPoint)}`;
          if (fieldKey in opts) {
            const source = opts[fieldKey];
            if (!source) {
              throw new Error(`Mountpoint ${mountPoint} given empty path`);
            }
            mounts.push({
              type: 'bind',
              target: mountPoint,
              source,
            });
            break;
          }
          throw new Error(`Package mountpoint ${mountPoint} requested a source path, but none was given`);
        default:
          throw new Error(`Package requested unrecognized mount type "${mountDef.type}"`);
      }
    }

    return {
      appKey,
      mounts,
      pid: this.record.pid,
    };
  }
}