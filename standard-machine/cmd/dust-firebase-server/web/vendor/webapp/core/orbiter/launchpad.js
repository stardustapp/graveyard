class Launchpad {
  constructor(domainName, chartName) {
    this.domainName = domainName;
    this.chartName = chartName;

    this.status = 'Idle';

    /*
    // Autoconfigure skychart endpoint, defaulting to TLS
    // Downgrade to insecure where real certs don't go: localhost, LAN, and IPs
    let protocol = 'wss';
    let port = '';
    if (this.domainName.match(/^(localhost|[^.]+.(?:lan|local)|(?:\d{1,3}\.)+\d{1,3})(?::(\d+))?$/)) {
      protocol = 'ws';
      port = ':9237';
    }*/
    const protocol = location.protocol.includes('s') ? 'wss' : 'ws';
    const port = location.port.length ? (':'+location.port) : '';
    this.endpoint = `${protocol}://${this.domainName}${port}/~~export/ws`;

    console.log('Configuring orbiter launchsite for chart', chartName);
  }

  static forCurrentUserApp() {
    //console.info('Autoconfiguring orbiter for the current context...');

    // Discover chartName from current URL
    if (location.pathname.startsWith('/~~')) {
      throw new Error("Core routes don't have a chart");
    } else if (!location.pathname.startsWith('/~')) {
      throw new Error("Unscoped routes don't have a chart");
    }
    const chartName = location.pathname.split('/')[1].slice(1);

    return new Launchpad(localStorage.domainName || location.hostname, chartName);
  }

  // Attempt to launch an orbiter
  launch() {
    if (this.status != 'Idle') {
      throw new Error(`Launchpad was in status ${this.status}, not ready to launch`);
    }
    this.status = 'Launching';

    return fetch('/~/app-session', {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(x => x.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.cause);
        }
        this.metadata = data.metadata;
        this.status = 'Done';
        return data.sessionPath;
      });
  }
}

if (typeof module !== "undefined" && module !== null) {
  module.exports = Launchpad;
}