const os = require('os');
const process = require('process');
const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
//const asyncTimeout = promisify(setTimeout);

async function execForLine(cmd) {
  const {stdout, stderr} = await exec(cmd);
  if (stderr.length > 0) {
    console.warn('WARN: exec() stderr:', stderr);
  }
  return stdout.trim();
}

const extensions = GraphEngine.extend('graph-daemon/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, {argv}) {
    return await graphCtx.newTopNode({
      CreatedAt: new Date,
      GitHash: process.env.DUST_GIT_HASH || await execForLine(`git describe --always --long --dirty`),
      LaunchFlags: argv,
      Config: {
        DataPath: argv.dataPath,
        Command: argv.command,
        PackageKey: argv.package,
        MethodName: argv.method,
        HttpPort: argv.port,
        HttpHost: argv.host,
      },
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
