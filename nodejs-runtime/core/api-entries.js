exports.FolderLiteral = class FolderLiteral {
  constructor(name, children) {
    this.Name = name;
    this.Type = 'Folder';
    this.Children = children || [];
  }

  append(child) {
    if (child.constructor === String) {
      this.Children.append({Name: child});
    } else {
      this.Children.append(child);
    }
  }

  // Helper to fetch one direct descendant, with optional useful checking
  getChild(name, required, typeCheck) {
    const child = this.Children.find(x => x.Name === name);
    if (required && (!child || !child.Type)) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} failed but was marked required`);
    }
    if (typeCheck && child && child.Type !== typeCheck) {
      throw new Error(`getChild(${JSON.stringify(name)}) on ${JSON.stringify(this.Name)} found a ${child.Type} but ${typeCheck} was required`);
    }
    return child;
  }

  inspect() {
    const childStr = this.Children.map(x => x.inspect()).join(', ');
    return `<Folder ${JSON.stringify(this.Name)} [${childStr}]>`;
  }
}

exports.StringLiteral = class StringLiteral {
  constructor(name, value) {
    this.Name = name;
    this.Type = 'String';

    this.set(value);
  }

  set(value) {
    this.StringValue = value || '';
    if (this.StringValue.constructor !== String) {
      throw new Error(`StringLiteral ${JSON.stringify(this.Name)} cannot contain a ${this.StringValue.constructor} value`);
    }
  }

  inspect() {
    return `<String ${JSON.stringify(this.Name)} ${JSON.stringify(this.StringValue)}>`;
  }
}
