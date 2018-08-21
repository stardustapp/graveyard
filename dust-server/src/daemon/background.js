async function boot(launchData) {
  console.group('Server boot');

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

    isKioskSession: launchData.isKioskSession,
    isPublicSession: launchData.isPublicSession,
    launchSource: launchData.source,

    platform: platformInfo,
  };
  //bugsnagClient.metaData = {};

  if (self.installType != 'development') {
    console.log('Keeping the screen on');
    chrome.power.requestKeepAwake('display');
  }

  const db = await OpenSystemDatabase();
  console.debug('BOOT: Opened system database');

  const kernel = await new Kernel(db).ready;
  Kernel.Instance = kernel;
  console.debug('BOOT: Kernel is initialized');

  const pkgRoot = await new Promise(r =>
    chrome.runtime.getPackageDirectoryEntry(r));

  // init the web server
  const webServer = new HttpServer(kernel.domainManager, async function (hostname) {
    const domain = await kernel.domainManager.findDomain(hostname);
    if (!domain) throw new Error('Domain does not exist');
    console.debug('loading host', hostname, domain);

    const webEnv = await kernel.domainManager.getWebEnvironment(domain);
    webEnv.bind('/~', new GateSite(hostname, domain.record.did, kernel));
    webEnv.bind('/~~libs/vendor', new WebFilesystemMount({
      entry: pkgRoot,
      prefix: 'vendor/',
    }));
    webEnv.bind('/~~libs/core', new WebFilesystemMount({
      entry: pkgRoot,
      prefix: 'src/webapp/core/',
    }));
    webEnv.bind('/~~libs/vue', new WebFilesystemMount({
      entry: pkgRoot,
      prefix: 'src/webapp/',
    }));
    return new VirtualHost(hostname, webEnv);
  });

  // expose the entire system environment on the network
  ExposeSkylinkOverHttp(kernel.systemEnv, webServer);

  webServer.startServer(9237);
  console.debug('BOOT: HTTP server is listening');

  await kernel.boot();
  console.debug('BOOT: User services have started');

  console.debug('BOOT: Completed :)');
  console.groupEnd();
}

function ToastNotif(text) {
  chrome.notifications.create(null, {
    type: 'basic',
    iconUrl: 'assets/stardust-round-128.png',
    title: 'Update',
    message: text,
  });
}

chrome.app.runtime.onLaunched.addListener(evt => {
  chrome.app.window.create('src/console/ui.html', {
    id: 'server-console',
    frame: 'none',
    outerBounds: {
      width: 800,
      height: 480,
    }
  });
  console.log('Opened server root UI');

  boot(evt).then(() => {
    chrome.notifications.create('startup', {
      type: 'basic',
      iconUrl: 'assets/stardust-round-128.png',
      title: 'Profile Server is running',
      message: 'Listening for Skylink on HTTP port 9237',
    });
  }, err => {
    console.error('Server boot failed:', err);
    // TODO: report to bugsnag
    chrome.notifications.create('startup', {
      type: 'basic',
      iconUrl: 'assets/stardust-round-128.png',
      title: '!!! Failed to start server :(',
      message: err.stack || err.message
    });
  });
});

// Restart immediately when there's new stuff
// TODO: don't restart _immediately_, lol.
chrome.runtime.onUpdateAvailable.addListener(function (details) {
  chrome.runtime.restart();
});
chrome.runtime.onRestartRequired.addListener(function (reason) {
  chrome.runtime.restart();
});
