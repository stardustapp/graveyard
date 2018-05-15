class EnumerationWriter {
  constructor(depth) {
    this.depth = depth;
    this.entries = []; // log of nodes we've visited
    this.names = []; // stack of where we're walking. .join('/')
  }

  visit(literal) {
    literal.Name = this.names.map(encodeURIComponent).join('/');
    this.entries.push(literal);
  }

  canDescend() {
    return this.names.length < this.depth;
  }

  descend(name) {
    this.names.push(name);
  }
  ascend() {
    this.names.pop();
  }

  toOutput() {
    return new FolderLiteral('enumeration', this.entries);
  }
}