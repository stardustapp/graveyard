bootDaemon = async function boot(argv) {
  console.group();
  console.group();
  console.debug('Starting server boot');

  const db = await OpenSystemDatabase(argv);
  console.debug('BOOT: Opened system database');

  const kernel = await new Kernel(db).ready;
  Kernel.Instance = kernel;
  console.debug('BOOT: Kernel is initialized');

  // init the web server
  const webServer = new HttpServer(kernel.domainManager, async function (hostname) {
    const domain = await kernel.domainManager.findDomain(hostname);
    if (!domain) throw new Error('Domain does not exist');
    console.debug('loading host', hostname, domain);

    const webEnv = await kernel.domainManager.getWebEnvironment(domain);
    webEnv.bind('/~/apps/builder', new WebFilesystemMount({
      entry: pkgRoot,
      prefix: 'src/app-builder/',
    }));
    webEnv.bind('/~/apps', new AppsApi(kernel, domain, {
      workerSource: new WebFilesystemMount({
        entry: pkgRoot,
        prefix: 'src/graph-worker/service-worker.js',
      }),
    }));
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
    webEnv.bind('/~~src', new WebFilesystemMount({
      entry: pkgRoot,
      prefix: 'src/',
    }));
    return new VirtualHost(hostname, webEnv);
  });

  // expose the entire system environment on the network
  ExposeSkylinkOverHttp(kernel.systemEnv, webServer);

  await webServer.startServer(argv);

  await kernel.boot();
  console.debug('BOOT: User services have started');

  console.debug('\r==> Server bootstrap completed. :)');

  console.log('TODO: do things');

  await db.close();
}

ToastNotif = function ToastNotif(text) {
  console.error(`\r--> SRV NOTIF: ${text}`);
}
