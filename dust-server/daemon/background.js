async function boot() {
  console.log('Booting server...');

  const self = await new Promise(resolve => chrome.management.getSelf(resolve));
  const platformInfo = await new Promise(resolve => chrome.runtime.getPlatformInfo(resolve));
  const baseUri = `chrome-extension://${self.id}`;
  window.bugsnagClient = bugsnag({
    // tell it about us
    apiKey: '3f2405514c98f4af0462776673985963',
    appVersion: self.version,
    releaseStage: self.installType,
    // disable things that we don't have
    navigationBreadcrumbsEnabled: false,
    autoCaptureSessions: false,
    // bugsnag ignores things from extensions, take that part out
    beforeSend: (report) => {
      if (report.request.url == baseUri+`/_generated_background_page.html`) {
        report.request.url = 'background';
      }
      report.stacktrace.forEach(x => {
        x.file = x.file.replace(baseUri, ''); // they become absolute paths
      });
    },
  });
  // report that we're the app BG page
  bugsnagClient.context = 'background';
  bugsnagClient.device = {
    extensionId: self.id,
    extensionType: self.type,
    isApplication: self.isApp,
    launchType: self.launchType,
    platform: platformInfo,
  };
  //bugsnagClient.metaData = {};

  if (self.installType != 'development') {
    console.log('Keeping the screen on');
    chrome.power.requestKeepAwake('display');
  }

  const db = await idb.open('system', 6, upgradeDB => {
    switch (upgradeDB.oldVersion) {
      case 0:
        // Stores name[@domain] profiles
        // Domainless profiles are 'local' users
        // These can be for remote users eventually
        upgradeDB.createObjectStore('profiles', {
          keyPath: 'chartName',
        });
      case 3:
        // Stores authoritative records of domains
        upgradeDB.createObjectStore('domains', {
          keyPath: 'domainName',
        });
      case 4:
        upgradeDB.deleteObjectStore('profiles');
        // name@domain accounts
        upgradeDB.createObjectStore('accounts', {
          keyPath: ['username', 'domain'],
        });
        // uniquely IDd sessions for users
        upgradeDB.createObjectStore('sessions', {
          keyPath: 'id',
        }).createIndex('accounts', ['username', 'domain']);
      case 5:
        // ugh let's just start over
        upgradeDB.deleteObjectStore('sessions');
        upgradeDB.deleteObjectStore('accounts');
        upgradeDB.deleteObjectStore('domains');

        const accounts = upgradeDB.createObjectStore('accounts', {
          keyPath: 'aid',
        });
        accounts.createIndex('address', ['username', 'domain'], { unique: true });

        const sessions = upgradeDB.createObjectStore('sessions', {
          keyPath: 'sid',
        });
        sessions.createIndex('aid',      'aid',      { unique: false });
        sessions.createIndex('lastUsed', 'lastUsed', { unique: false });

        const domains = upgradeDB.createObjectStore('domains', {
          keyPath: 'did',
        });
        domains.createIndex('fqdn', 'fqdns', { unique: true,  multiEntry: true });
        domains.createIndex('aid',  'aids',  { unique: false, multiEntry: true });
    }
  });
  console.log('Opened database');

  const accountManager = new AccountManager(db);
  const sessionManager = new SessionManager(db, accountManager);
  const domainManager = new DomainManager(db);

  // create a root environment using GateApi
  const systemEnv = new Environment();
  const gateApi = new GateApi(systemEnv, accountManager, sessionManager, domainManager);

  // build the localhost site
  const pkgRoot = await new Promise(r =>
    chrome.runtime.getPackageDirectoryEntry(r));
  const webEnv = new Environment('http://localhost');
  webEnv.bind('', new DefaultSite('localhost'));
  webEnv.bind('/~', new GateSite('localhost', accountManager, sessionManager, domainManager));
  webEnv.bind('/~dan/editor', new WebFilesystemMount({
    entry: pkgRoot,
    prefix: 'platform/apps/editor/',
  }));
  webEnv.bind('/~dan/panel', new WebFilesystemMount({
    entry: pkgRoot,
    prefix: 'platform/apps/panel/',
  }));
  webEnv.bind('/~~libs', new WebFilesystemMount({
    entry: pkgRoot,
    prefix: 'platform/libs/',
  }));
  const localVHost = new VirtualHost('localhost', webEnv);

  // init the web server
  const webServer = new HttpServer(domainManager, localVHost);

  // expose the entire system environment on the network
  const nsExport = new NsExport(systemEnv);
  nsExport.mount(webServer);

  // all good, let's listen
  webServer.startServer(9237);
  console.log('Started web server');
}

function ToastNotif(text) {
  chrome.notifications.create(null, {
    type: 'basic',
    iconUrl: 'assets/stardust-round-128.png',
    title: 'Update',
    message: text,
  });
}

  //chrome.runtime.getPackageDirectoryEntry(packageDirectory => {
  //  packageDirectory.getDirectory(directory, {create: false}, webroot => {
  //    var fs = new WSC.FileSystem(webroot)

// TODO: visible window required to open the firewall on ChromeOS

chrome.app.runtime.onLaunched.addListener(evt => {
  chrome.app.window.create('console/ui.html', {
    id: 'server-console',
    frame: 'none',
    outerBounds: {
      width: 800,
      height: 480,
    }
  });
  console.log('Opened server console');

  boot().then(() => {
    chrome.notifications.create('startup', {
      type: 'basic',
      iconUrl: 'assets/stardust-round-128.png',
      title: 'Profile Server is running',
      message: 'Listening for Skylink on HTTP port 9237',
    });
  }, err => {
    console.log('Server boot failed:', err);
    chrome.notifications.create('startup', {
      type: 'basic',
      iconUrl: 'assets/stardust-round-128.png',
      title: '!!! Failed to start server :(',
      message: err.stack || err.message
    });
  });
});

// Restart immediately when there's new stuff
// TODO: don't restart immediately, lol.
chrome.runtime.onUpdateAvailable.addListener(function (details) {
  //setState('updateAvailable', details);
  chrome.runtime.restart();
});
chrome.runtime.onRestartRequired.addListener(function (reason) {
  //setState('restartRequired', reason);
  chrome.runtime.restart();
});
