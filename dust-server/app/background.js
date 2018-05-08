async function boot() {
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

boot().then(() => {
  chrome.notifications.create('startup', {
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Profile Server is running',
    message: 'Listening for Skylink on HTTP port 9237',
  });
}, err => {
  console.log('Server boot failed:', err);
  chrome.notifications.create('startup', {
    type: 'basic',
    iconUrl: 'icon.png',
    title: '!!! Failed to start server :(',
    message: err.stack || err.message
  });
});

function ToastNotif(text) {
  chrome.notifications.create(null, {
    type: 'basic',
    iconUrl: 'icon.png',
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
  if (evt.source === 'reload') {
    return;
  }
  
  chrome.app.window.create('window.html', {
    'outerBounds': {
      'width': 400,
      'height': 500
    }
  });
});
