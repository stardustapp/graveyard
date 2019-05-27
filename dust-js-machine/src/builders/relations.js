
class RelationBuilder {
  constructor(constraints) {
    this.constraints = constraints;
  }

  static forConfig(config, allowedExtras=[]) {
    try {
      const {
        kind, subject, predicate, object, engineKey,
        exactly, atMost, uniqueBy,
        ...extras
      } = config;

      const extraKeys = Object
        .keys(extras)
        .filter(key => allowedExtras.includes(key));
      if (extraKeys.length) throw new Error(
        `RelationBuilder received extra keys: ${extraKeys.join(', ')}`);

      const constraints = [];
      if (exactly !== undefined)
        constraints.push({type: 'exactly', num: exactly});
      if (atMost !== undefined)
        constraints.push({type: 'atMost', num: atMost});
      if (uniqueBy !== undefined)
        constraints.push({type: 'uniqueBy', path: uniqueBy});

      switch (kind || (predicate ? 'arbitrary' : null)) {
        case 'arbitrary':
          return new ArbitraryRelationBuilder(constraints, subject, predicate, object, engineKey);
        case 'top':
          if (object || predicate || subject) throw new Error(
            `'top' relation cannot have any explicit 'object' or 'predicate' or 'subject'`);
          return new TopRelationBuilder(constraints);
        case 'any':
          if (predicate) throw new Error(
            `'any' relation cannot have any explicit 'predicate'`);
          return new AnyRelationBuilder(constraints, subject, object, engineKey);
        case 'ref':
          if (predicate) throw new Error(
            `'ref' relation cannot have an explicit 'predicate'`);
          return new RefRelationBuilder(constraints, subject, object, engineKey);
        default: throw new Error(
          `Relationship must have a 'predicate' value or a valid 'kind'`);
      }
    } catch (err) {
      console.log('Failed to compile relation config', config);
      throw err;
    }
  }

  link(nodeCtx, resolver) {
    if (this.isLinked) throw new Error(
      `double linking a RelationBuilder is bad!`);
    this.isLinked = true;
    resolver.allRelations.add(this);
  }

  [Symbol.for('nodejs.util.inspect.custom')](depth, options) {
    return [
      options.stylize(`<${this.constructor.name}`, 'date'),
      options.stylize(this.predicate, 'name'),
      options.stylize(this.direction, 'special'),
      options.stylize(this.specifier, 'special'),
      options.stylize(`'${this.otherName}'`, 'string'),
      options.stylize('/>', 'date'),
    ].join(' ');
  }
}

class ArbitraryRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, predicate, object, engineKey) {
    if (!predicate || predicate.constructor !== String) throw new Error(
      `Relationship 'predicate' must be a String`);
    if (!object && !subject) throw new Error(
      `'arbitrary' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'arbitrary' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Arbitrary';
    this.predicate = predicate;
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.localType = nodeCtx;
    if (this.otherEngineKey) {
      const targetEngine = GraphEngine.get(this.otherEngineKey);
      this.otherType = targetEngine.names.get(this.otherName);
    } else {
      this.otherType = resolver.resolveName(this.otherName);
    }
    if (!this.otherType) throw new Error(
      `Arbitrary relation ${this.stringForm} didn't resolve to a type.`);
  }
}

class RefRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, object, engineKey) {
    if (!object && !subject) throw new Error(
      `'ref' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'ref' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Ref';
    this.predicate = 'REFERENCES';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${this.predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.localType = nodeCtx;
    if (this.otherEngineKey) {
      const targetEngine = GraphEngine.get(this.otherEngineKey);
      this.otherType = targetEngine.names.get(this.otherName);
    } else {
      this.otherType = resolver.resolveName(this.otherName);
    }
    if (!this.otherType) throw new Error(
      `Ref relation ${this.stringForm} didn't resolve to a type.`);
  }
}

class TopRelationBuilder extends RelationBuilder {
  constructor(constraints) {
    super(constraints);

    this.type = 'Top';
    // to really get the point across
    this.predicate = 'TOP';
    this.direction = 'in';
    this.otherName = 'top';

    this.specifier = 'from';
    this.stringForm = `(top)`;
  }

  link(nodeCtx, resolver) {
    super.link(nodeCtx, resolver);
    this.topType = nodeCtx;
  }
}

class AnyRelationBuilder extends RelationBuilder {
  constructor(constraints, subject, object) {
    if (!object && !subject) throw new Error(
      `'any' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'any' relation can't explicitly have both an 'object' and a 'subject'`);

    super(constraints);
    this.type = 'Any';
    // to get the point across
    this.predicate = 'ANY';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `(any) ${this.direction} ${this.specifier} '${this.otherName}'`;
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    RelationBuilder,
    ArbitraryRelationBuilder,
    TopRelationBuilder,
    AnyRelationBuilder,
  };
}
