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
}