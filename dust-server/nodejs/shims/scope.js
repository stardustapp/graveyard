const pkgMeta = require('../package.json');

// TODO: create immutable objects
window = self = global;
global.navigator = {
  userAgent: `Stardust ${pkgMeta.name}/${pkgMeta.version}`,
};

global.Worker = class Worker {
  constructor(...args) {
    throw new Error(`TODO: impl Worker() in nodejs`);
  }
}

global.crypto = require('crypto');
global.fetch = require('node-fetch');
global.AWS = require('aws-sdk');
