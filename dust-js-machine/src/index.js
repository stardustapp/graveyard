global.ExportAll = obj => {
  for (const key in obj) {
    global[key] = obj[key];
  }
};
//ExportAll(require('./model'));
ExportAll(require('./field-types'));
ExportAll(require('./utils/async-cache.js'));

module.exports = {
  ...require('./loader.js'),
  ...require('./machine.js'),
};
