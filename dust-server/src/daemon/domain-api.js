/// Presents a personalized API that lets users manager domain ownership and settings
DomainsApi = class DomainsApi {
  constructor(manager, chartName) {
    this.env = new Environment();
    this.manager = manager;
    this.chartName = chartName;

    // lets new users sign up for a name
    this.env.mount('/register', 'function', new PlatformApiFunction(this, 'register', {
      input: {
        domain: String,
      },
      output: {
        ownershipToken: String,
      },
      impl: this.registerApi,
    }));

    // lets list their domains
    this.env.bind('/mine', new MyDomainsApi(manager, chartName));
  }

  async registerApi({domain}) {
    console.log('register domain:', domain);
    const record = await this.manager.registerDomain(domain, '~'+this.chartName);
    return {ownershipToken: record.ownershipToken};
  }
};

class MyDomainsApi {
  constructor(manager, chartName) {
    this.manager = manager;
    this.chartName = chartName;
  }

  async getEntry(path) {
    if (path == '') {
      return {
        get: this.getRoot.bind(this),
        enumerate: this.enumerateRoot.bind(this),
      };
    }

    const parts = path.slice(1).split('/').map(decodeURIComponent);
    if (parts.length == 1) {
      const domain = decodeURIComponent(path.slice(1));
      return {
        get: this.getDomain.bind(this, domain),
        enumerate: this.enumerateDomain.bind(this, domain),
      }
    } else if (parts.length == 2 && parts[1] == 'my-role') {
      const domain = await this.manager.getDomain(parts[0]);
      return {
        get: () => new StringLiteral('my-role', domain.highestRoleFor('~'+this.chartName)),
      };
    }
    throw new Error(`MyDomainsApi getEntry ${path}`);
  }


  async getRoot() {
    const domains = await this.manager.listDomains();
    return new FolderLiteral('mine', domains
      .filter(d => d.hasGrantFor('~'+this.chartName))
      .map(d => new FolderLiteral(d.name)));
  }

  async enumerateRoot(enumer) {
    enumer.visit({Type: 'Folder'});
    if (!enumer.canDescend()) return;
    for (const domain of await this.manager.listDomains()) {
      if (domain.hasGrantFor('~'+this.chartName)) {
        enumer.descend(domain.name);
        enumer.visit({Type: 'Folder'});
        if (enumer.canDescend()) {
          enumer.descend('my-role');
          enumer.visit(new StringLiteral('', domain.highestRoleFor('~'+this.chartName)));
          enumer.ascend();
        }
        enumer.ascend();
      }
    }
  }


  async getDomain(domainName) {
    const domain = await this.manager.getDomain(domainName);
    if (!domain.hasGrantFor('~'+this.chartName))
      throw new Error(`domain not accessible: ${domain}`);

    return new new FolderLiteral(d.name, [
      new StringLiteral('my-role'),
    ]);
  }

  async enumerateDomain(domainName, enumer) {
    const domain = await this.manager.getDomain(domainName);
    if (!domain.hasGrantFor('~'+this.chartName)) return;

    enumer.visit({Type: 'Folder'});
    if (!enumer.canDescend()) return;

    enumer.descend('my-role');
    enumer.visit(new StringLiteral('', domain.highestRoleFor('~'+this.chartName)));
    enumer.ascend();

    enumer.descend('webroot');
    enumer.visit(new FolderLiteral(''));
    enumer.ascend();
  }

}
