/// Presents a personalized API that lets users manager domain ownership and settings
class DomainsApi {
  constructor(manager, chartName) {
    this.env = new Environment();
    this.manager = manager;
    this.chartName = chartName;

    // lets new users sign up for a name
    this.env.mount('/register', 'function', {
      invoke: this.ivkRegisterDomain.bind(this),
    });

    // lets list their domains
    this.env.bind('/mine', new MyDomainsApi(manager, chartName));
  }

  async ivkRegisterDomain(input) {
    if (!input || input.constructor !== FolderLiteral) {
      throw new Error(`Information needed when registering a domain`);
    }
    const inputObj = {};
    input.Children.forEach(({Name, Type, StringValue}) => {
      inputObj[Name] = StringValue;
    });
    console.log('register domain input is', inputObj);

    const domainName = inputObj.domain;
    if (!domainName) {
      throw new Error(`No 'domain name' given with register request!`);
    }

    const domain = await this.manager.registerDomain(domainName, '~'+this.chartName);
    return { async get() {
      return new StringLiteral('ownershipToken', domain.ownershipToken);
    }};
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
  }

}
