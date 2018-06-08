// meeseeks class for working with domain snapshots
class Domain {
  constructor(data, manager=null) {
    this.data = data;
    this.manager = manager;

    this.name = data.domainName;
  }

  hasGrantFor(identity) {
    return this.data.grants
        .some(g => g.identity === identity);
  }

  highestRoleFor(identity) {
    const roles = new Set;
    this.data.grants
      .filter(g => g.identity === identity)
      .forEach(g => roles.add(g.role));

    return [
      'owner',
      'manager',
      'user',
      'guest',
    ].find(x => roles.has(x));
  }
}