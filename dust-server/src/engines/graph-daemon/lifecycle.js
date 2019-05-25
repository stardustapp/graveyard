const os = require('os');
const process = require('process');

const extensions = GraphEngine.extend('graph-daemon/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, {Config}) {
    return await graphCtx.newTopNode({
      CreatedAt: new Date,
      LaunchFlags: {},
      Config: Config.Options,
      Host: {
        Platform: os.platform(),
        Release: os.release(),
        Architecture: os.arch(),
        Runtime: 'nodejs',
        HostName: os.hostname(),
        UserName: os.userInfo().username,
        HomeDir: os.homedir(),
        WorkDir: process.cwd(),
      }
    });
  },

};
