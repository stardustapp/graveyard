class Skychart {
  constructor(skylinkUri) {
    this.skylink = new Skylink('', skylinkUri);
  }

  openChart(name) {
    const input = Skylink.String('chart-name', name);
    const dest = '/tmp/chart-' + name;

    return this.skylink
      .invoke('/pub/open/invoke', input, dest)
      .then(() => new Chart(this.skylink, name, dest));
  }

  manageChart(name) {
    return this
      .openChart(name)
      .then(x => x.manage());
  }

  createChart(name, ownerName, ownerEmail) {
    const input = Skylink.toEntry('input', {
      'chart-name': name,
      'owner-name': ownerName,
      'owner-email': ownerEmail,
    });
    const dest = '/tmp/chart-' + this.chartName;

    return this.skylink
      .invoke('/pub/create/invoke', input, dest)
      .then(() => new Chart(this.skylink, name, dest));
  }
}

class Chart {
  constructor(skylink, name, path) {
    this.skylink = skylink;
    this.name = name;
    this.path = path;
  }

  loadMetadata() {
    return this.skylink.enumerate(this.path, {
      includeRoot: false,
    }).then(children => {
      this.ownerName = '';
      this.ownerEmail = '';
      this.createdDate = null;
      this.homeDomain = null;

      children.forEach(child => {
        switch (child.Name) {
          case 'owner-name':
            this.ownerName = child.StringValue;
            break;
          case 'owner-email':
            this.ownerEmail = child.StringValue;
            break;
          case 'created-date':
            this.createdDate = new Date(child.StringValue);
            break;
          case 'home-domain':
            this.homeDomain = child.StringValue;
            break;
        }
      });
    }).then(() => this);
  }

  manage() {
    const dest = '/tmp/manage-' + this.name;
    return this.skylink
      .invoke(this.path + '/manage/invoke', null, dest)
      .then(() => new ChartManager(this.skylink, this.name, dest));
  }

}

class ChartManager {
  constructor(skylink, name, path) {
    this.skylink = skylink;
    this.name = name;
    this.path = path;
  }

  loadEntries() {
    return this.skylink.enumerate(this.path + '/entries', {
      maxDepth: 2,
      includeRoot: false,
    }).then(children => {
      const entries = new Map();

      children.forEach(child => {
        const parts = child.Name.split('/');
        if (parts.length === 1 && child.Type === 'Folder') {
          entries.set(parts[0], { name: parts[0] });
        } else if (parts.length === 2 && child.Type === 'String') {
          entries.get(parts[0])[camel(parts[1])] = child.StringValue;
        }
      });

      this.entries = [];
      entries.forEach(obj => this.entries.push(obj));
    }).then(() => this);
  }

  visualize() {
    const dest = '/tmp/compile-' + parseInt(Math.random().toString().slice(2)).toString(36);
    return this.skylink
      .invoke(this.path + '/compile/invoke', null, dest)
      .then(() => this.skylink.loadFile(dest + '/visualization.html'));
  }

  storeEntry(name, mountPath, deviceType, deviceUri, deviceInput) {
    var entry = {
      'mount-path': mountPath,
      'device-type': deviceType,
      'device-uri': deviceUri,
    };
    if (deviceInput != null) {
      entry['device-input'] = deviceInput;
    }

    return this.skylink.store(
      this.path + '/entries/' + name,
      Skylink.toEntry(name, entry)
    );
  }

  findClosestMount(path) {
    var closestEntry = {mountPath: ''};
    this.entries.forEach(entry => {
      if (path.startsWith(entry.mountPath)) {
        if (entry.mountPath.length > closestEntry.mountPath.length) {
          closestEntry = entry;
        }
      }
    });
    return closestEntry;
  }
}