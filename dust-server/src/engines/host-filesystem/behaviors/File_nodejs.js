const fs = require('fs');

GraphEngine.attachBehavior('host-filesystem/v1-beta1', 'File', {

  createReadStream(opts) {
    const path = this.Mount.resolvePath(this.Path);
    return fs.createReadStream(path, opts);
  },

});
