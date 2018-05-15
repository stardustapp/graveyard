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
        enumerate: this.enumerate.bind(this),
        subscribe: this.subscribe.bind(this),
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

  async enumerate(enumer) {
    enumer.visit({Type: 'Folder'});
    if (enumer.canDescend()) {
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
  }

  async subscribe(depth, newChannel) {
    return await newChannel.invoke(async c => {
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', ''),
        new FolderLiteral('entry'),
      ]));
      for (const domain of await this.manager.listDomains()) {
        if (domain.hasGrantFor('~'+this.chartName)) {
          c.next(new FolderLiteral('notif', [
            new StringLiteral('type', 'Added'),
            new StringLiteral('path', domain.name),
            new FolderLiteral('entry'),
          ]));
          c.next(new FolderLiteral('notif', [
            new StringLiteral('type', 'Added'),
            new StringLiteral('path', domain.name+'/my-role'),
            new StringLiteral('entry', domain.highestRoleFor('~'+this.chartName)),
          ]));
        }
      }
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Ready'),
      ]));
    });
  }
}
