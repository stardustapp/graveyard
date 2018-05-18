class EnumerationWriter {
  constructor(depth) {
    this.depth = depth;
    this.entries = []; // log of nodes we've visited
    this.names = []; // stack of where we're walking. .join('/')
  }

  visit(literal) {
    literal.Name = this.names.map(encodeURIComponent).join('/');
    this.entries.push(literal);
    return this;
  }

  canDescend() {
    return this.names.length < this.depth;
  }

  descend(name) {
    this.names.push(name);
    return this;
  }
  ascend() {
    if (this.names.length === 0)
      throw new Error(`BUG: EnumerationWriter ascended above its root`);
    this.names.pop();
    return this;
  }

  toOutput() {
    if (this.names.length > 0)
      throw new Error(`BUG: EnumerationWriter asked to serialize, but is still descended`);
    return new FolderLiteral('enumeration', this.entries);
  }
}


// Provides a shitty yet complete non-reactive subscription
// Gets its data from the provided enumeration lambda
// Shuts down the channel when it's down as a signal downstream
function EnumerateIntoSubscription(enumHandler, depth, newChannel) {
  return newChannel.invoke(async c => {
    const enumer = new EnumerationWriter(depth);
    const enumeration = await enumHandler(enumer);
    for (const entry of enumer.toOutput().Children) {
      const fullName = entry.Name;
      entry.Name = 'entry';
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', fullName),
        entry,
      ]));
    }
    c.next(new FolderLiteral('notif', [
      new StringLiteral('type', 'Ready'),
    ]));
    c.stop(new StringLiteral('nosub',
        `This entry does not implement reactive subscriptions`));
  });
}