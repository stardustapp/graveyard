launchDaemon = async function launchDaemon(argv) {
  let kernel;
  try {

    console.group();
    console.group();
    console.debug('Starting server boot');
    try {

      kernel = new Kernel(argv);
      await kernel.ready;
      await kernel.boot();

    } finally {
      console.groupEnd();
      console.groupEnd();
    }
    console.log('==> Completed kernel boot :)');
    console.log();

    await kernel.run();

    console.log();
    console.log(`==> Daemon function returned.`);
    kernel.unref();

  } catch (err) {
    console.error();
    console.error(`!-> Daemon stopped unexpectedly!`);
    console.error(err.stack);
    //await kernel.stop(); // TODO
    process.exit(1);

  }
  // indent any shutdown operations
  console.group();
  console.group();

  // TODO: stop the kernel after a timeout
}

ToastNotif = function ToastNotif(text) {
  console.error(`\r--> SRV NOTIF: ${text}`);
}
