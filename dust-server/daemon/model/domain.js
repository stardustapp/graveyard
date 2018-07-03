// meeseeks class for working with domain snapshots
class Domain {
  constructor(data) {
    this.record = data;
  }

  hasGrantFor(account) {
    return this.record.grants
        .some(g => g.aid === account.record.aid);
  }

  highestRoleFor(account) {
    const roles = new Set;
    this.record.grants
      .filter(g => g.aid === account.record.aid)
      .forEach(g => roles.add(g.role));

    return [
      'owner',
      'manager',
      'user',
      'guest',
    ].find(x => roles.has(x));
  }
}