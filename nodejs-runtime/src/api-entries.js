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
}

exports.StringLiteral = class StringLiteral {
  constructor(name, value) {
    this.Name = name;
    this.Type = 'String';
    this.StringValue = value || '';
  }

  set(value) {
    this.StringValue = value || '';
  }
}
