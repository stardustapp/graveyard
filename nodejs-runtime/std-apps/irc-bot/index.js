const path = require('path');

const {runMain, sleep} = require('starcore/utils');
const {NsExport} = require('starcore/nsexport');
const {Environment} = require('starcore/environment');
const {StringLiteral, FolderLiteral} = require('starcore/api-entries');

runMain(() => {

  // create a blank root environment
  const systemEnv = new Environment();

  // simple state store in local folder
  systemEnv.mount('/persist', 'fs-string-dict', {
    fsRoot: path.resolve(__dirname, 'persisted'),
  });

  // mount the irc dialer from the default modem
  systemEnv.mount('/dial-func', 'network-import', {
    url: 'http://apt:30555/dial',
  });

  const networkEntry = systemEnv.getEntry('/persist/networks', true, 'get');
  var networks = JSON.parse(networkEntry.get().StringValue || '{}');
  if (Object.keys(networks).length === 0) {
    console.log('seeding network config with freenode');
    networkEntry.put(new StringLiteral('networks', JSON.stringify({
      freenode: {
        nickname: 'skylink2',
        hostname: 'chat.freenode.net',
        port: 6697,
        useTls: true,
      },
    })));
    networks = JSON.parse(networkEntry.get().StringValue);
  }

  console.log('network configs:', networks);

  const apis = {

    // provisions a new IRC connection and starts dialing the given server.
    // returns the wire URI once a line is reserved.
    // persist the wire's URI to recover the connection after a restart.
    // mount the wire by URI to watch the connection state and send packets.
    dialServer(nickname, hostname, port, useTls) {

      const dialFunc = systemEnv.getEntry('/dial-func/invoke');
      if (!dialFunc || !dialFunc.invoke) {
        throw new Error(`IRC dial function not available`);
      }

      const wireUri = dialFunc.invoke(new FolderLiteral('wire-config', [
        new StringLiteral('nickname', nickname),
        new StringLiteral('username', nickname),
        //new StringLiteral('password', ''),
        new StringLiteral('full-name', 'Stardust IRC bot'),

        new StringLiteral('hostname', hostname),
        new StringLiteral('port', ''+port),
        new StringLiteral('use-tls', useTls ? 'yes' : 'no'),

        new StringLiteral('ident', 'bot'),
      ]));

      console.log('dial returned', wireUri);
    }

  }

  while (true) {
    console.log();
    console.log('Syncing networks...');
    for (netName in networks) {
      const {nickname, hostname, port, useTls} = networks[netName];

      const wireUriEntry = systemEnv.getEntry('/persist/'+netName+'-wire-uri', true, 'get');
      var wireUri = wireUriEntry.get().StringValue;
      console.log(netName, 'wire is at', wireUri);

      if (!wireUri) {
        console.log('no wire for', netName, 'so making one now');
        const uriEntry = apis.dialServer(nickname, hostname, port, useTls);
      }
    }

    console.log('Done.');
    process.exit(0);
    sleep(60000);
  }

  //apis.dialServer('danopia', 'asdf', 6667, false);
});
