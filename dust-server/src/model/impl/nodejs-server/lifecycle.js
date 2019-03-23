const os = require('os');
const process = require('process');
const {promisify} = require('util');
const exec = promisify(require('child_process').exec);
const asyncTimeout = promisify(setTimeout);

async function execForLine(cmd) {
  const {stdout, stderr} = await exec("git describe --always --long --dirty");
  if (stderr.length > 0) {
    console.warn('WARN: exec() stderr:', stderr);
  }
  return stdout.trim();
}

GraphEngine.extend('nodejs-server/v1-beta1').lifecycle = {

  async createServer(config) {
    console.log('creating server with config', config);

    const instance = GraphEngine
      .get('nodejs-server/v1-beta1')
      .spawnTop({
        CreatedAt: new Date,
        GitHash: await execForLine(`git describe --always --long --dirty`),
        Config: config,
        Host: {
          Platform: os.platform(),
          Release: os.release(),
          Architecture: os.arch(),
          Runtime: 'nodejs',
          HostName: os.hostname(),
          UserName: os.userInfo().username,
          HomeDir: os.homedir(),
          WorkDir: process.cwd(),
        },
      });

    console.log('TODO: actually open level');

    /*
    server.baseDb = new ServerDatabase(server.Config.Data);
    await this.baseDb.ready;
    console.debug('Opened system database');

    const engine = await this.baseDb.transact('readonly', async ctx => {
      ctx.seedRoot();
    });
    */

    /*
    const engine = await this.baseDb.transact('readwrite', async ctx => {
      console.log('TODODODODODODODOO');
    });
    */

    let webServer;
    if (instance.Config.Command === 'serve') {
      // init the web server to serve up skylink (and more)
      webServer = new HttpServer(this.TODO, async function (hostname) {
        /*
        const domain = await kernel.domainManager.findDomain(hostname);
        if (!domain) throw new Error('Domain does not exist');
        console.debug('loading host', hostname, domain);
        */
        return new VirtualHost(hostname, null);
      });

      // expose the entire system environment on the network
      ExposeSkylinkOverHttp(this.systemEnv, webServer);
      await webServer.startServer({
        port: instance.Config.HttpPort,
      });
    }


    return {
      instance,
      webServer,
    };

  },

};
