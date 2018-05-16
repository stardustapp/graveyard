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