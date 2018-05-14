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

  const db = await idb.open('system', 3, upgradeDB => {
    const profiles = upgradeDB.createObjectStore('profiles', {
      keyPath: 'chartName',
    });
    //const drivers = upgradeDB.createObjectStore('drivers');
  });
  console.log('Opened database');


  // create a blank root environment
  const systemEnv = new Environment();

  // mount the local persist store
  /*systemEnv.mount('/db', 'mongodb', {
    url: 'mongodb://localhost:27017',
    database: 'startest',
  });*/

  // create a manager (mounts itself)
  const sessionManager = new SessionManager(systemEnv, db);

  // TODO: install the domain schema
  //const schemas = systemEnv.getEntry('/db/schemas');
  //console.log('Database schemas:', schemas.enumerate());
  //const domainSchema = systemEnv.getEntry('/db/schemas/domain');
  //console.log('Installing domain schema:', domainSchema.put("hello"));

  // expose the entire system environment on the network
  const server = new NsExport(systemEnv);
  server.startServer(9237);
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

//chrome.app.runtime.onLaunched.addListener(function() {});

  //chrome.runtime.getPackageDirectoryEntry(packageDirectory => {
  //  packageDirectory.getDirectory(directory, {create: false}, webroot => {
  //    var fs = new WSC.FileSystem(webroot)

// TODO: visible window required to open the firewall on ChromeOS

chrome.app.runtime.onLaunched.addListener(evt => {
  chrome.app.window.create('console/ui.html', {
    id: 'server-console',
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
