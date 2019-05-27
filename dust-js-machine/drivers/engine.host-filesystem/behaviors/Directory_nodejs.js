const path = require('path');

// const BYTES_RANGE_REGEXP = /^ *bytes=/;
// const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year
// const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

CURRENT_LOADER.attachBehavior(class Directory {

  getDirectory(subPath) {
    return this.Mount.getEntry(path.join(this.Path, subPath), 'Directory');
  }
  getFile(subPath) {
    return this.Mount.getEntry(path.join(this.Path, subPath), 'File');
  }
  getEntry(subPath) {
    return this.Mount.getEntry(path.join(this.Path, subPath));
  }
  readChildNames() {
    return this.Mount.listChildren(this.Path);
  }

  baseName() {
    return path.basename(this.Path);
  }

});
