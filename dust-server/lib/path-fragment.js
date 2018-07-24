// A 'name' is any UTF-8 string of nonzero length.
// A 'part' is a name that has been encodeURIComponent'd.
// A 'path' is a string of slash-seperated parts.
// Paths can be absolute, meaning they have a preceding slash.

class PathFragment {
  constructor(isAbsolute, parts=[]) {
    if (typeof isAbsolute !== 'boolean')
      throw new Error(`PathFragment takes isAbsolute bool as the first param`);

    if (parts.includes(''))
      throw new Error(`Paths cannot include zero-length names`);

    this.isAbsolute = isAbsolute;
    this.parts = parts.slice(0);
  }

  pushName(name) {
    if (part === '') throw new Error(`Paths cannot include zero-length names`);
    this.parts.push(encodeURIComponent(name));
  }
  pushPart(part) {
    if (part === '') throw new Error(`Paths cannot include zero-length parts`);
    this.parts.push(part);
  }

  lastPart() {
    if (this.parts.legnth === 0) throw new Error(`no parts to get last of`);
    return this.parts[this.parts.length-1];
  }
  lastName() {
    if (this.parts.legnth === 0) throw new Error(`no parts to get last of`);
    return decodeURIComponent(this.parts[this.parts.length-1]);
  }

  popPart() {
    return this.parts.pop();
  }
  popName() {
    return decodeURIComponent(this.parts.pop());
  }

  count() {
    return this.parts.length;
  }
  slice(...arg) {
    return new PathFragment(this.isAbsolute, this.parts.slice(...arg));
  }

  startsWith(other) {
    // shorthands for 'other' construction
    if (other.constructor === Array)
      other = new PathFragment(this.isAbsolute, other);
    if (other.constructor === String)
      other = PathFragment.parse(other);

    if (this.isAbsolute !== other.isAbsolute) return false;
    if (other.parts.length > this.parts.length) return false;
    for (let i = 0; i < other.parts.length; i++) {
      if (this.parts[i] !== other.parts[i])
        return false;
    }
    return true;
  }

  clone() {
    return new PathFragment(isAbsolute, parts);
  }
  toString() {
    return (this.isAbsolute ? '/' : '') + this.parts.join('/');
  }

  static parse(string) {
    if (string === '') {
      string = '/';
    }

    const isAbsolute = string.startsWith('/');
    if (isAbsolute) {
      string = string.slice(1);
    }

    const parts = (string.length === 0) ? []
      : string.split('/');
    return new PathFragment(isAbsolute, parts);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { PathFragment };
}