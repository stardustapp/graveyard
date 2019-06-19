class Orbiter {
  constructor() {
    this.metadata = {};
    this.endpoint = '';
    this.path = '';

    this.launcher = null;
    this.skylink = null;
    this.mountTable = null;
    this.status = 'Idle';

    this.stats = {
      ops: 0,
      chans: 0,
      pkts: 0,
      fails: 0,
    };
  }

  autoLaunch(launcher) {
    if (!launcher) {
      launcher = Launchpad.forCurrentUserApp();
    }
    this.launcher = launcher;
    this.status = 'Launching';

    const {chartName, domainName} = this.launcher;
    this.mountTable = new MountTable('skylink://', x => this.status = x);

    return this.launcher.launch()
      .then(path => {
        this.metadata = this.launcher.metadata;

        // TODO: mount to /srv
        this.mountTable.mount('', 'skylink', {
          endpoint: this.launcher.endpoint,
          path: path,
          stats: this.stats,
        });

        // TODO: remove when nothing uses orbiter#skylink
        // TODO: should be mounted to /srv
        this.skylink = this.mountTable.mounts.get('').skylink;

        //return this.launch(this.launcher.endpoint, path);
      });
  }
}

if (typeof module !== "undefined" && module !== null) {
  module.exports = Orbiter;
}