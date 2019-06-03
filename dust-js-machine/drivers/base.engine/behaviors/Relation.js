CURRENT_LOADER.attachBehavior(class Relation {
  // constructor(constraints) {
  //   this.constraints = constraints;
  // }

  build(config) {
    const {
      kind, subject, predicate, object, engineKey,
      exactly, atMost, uniqueBy,
      ...extras
    } = config;

    const extraKeys = Object
      .keys(extras);
      // .filter(key => allowedExtras.includes(key));
    if (extraKeys.length) throw new Error(
      `RelationBuilder received extra keys: ${extraKeys.join(', ')}`);

    this.constraints = [];
    if (exactly !== undefined)
      this.constraints.push({type: 'exactly', num: exactly});
    if (atMost !== undefined)
      this.constraints.push({type: 'atMost', num: atMost});
    if (uniqueBy !== undefined)
      this.constraints.push({type: 'uniqueBy', path: uniqueBy});

    this.kind = kind || (predicate ? 'arbitrary' : null);
    switch (this.kind) {
      case 'arbitrary':
        this.setupArbitrary(subject, predicate, object, engineKey);
        break;
      case 'top':
        if (object || predicate || subject) throw new Error(
          `'top' relation cannot have any explicit 'object' or 'predicate' or 'subject'`);
        this.setupTop();
        break;
      case 'any':
        if (predicate) throw new Error(
          `'any' relation cannot have an explicit 'predicate'`);
        this.setupAny(subject, object, engineKey);
        break;
      case 'ref':
        if (predicate) throw new Error(
          `'ref' relation cannot have an explicit 'predicate'`);
        this.setupRef(subject, object, engineKey);
        break;
      default: throw new Error(
        `Relationship must have a 'predicate' value or a valid 'kind'`);
    }
  }

  setupArbitrary(subject, predicate, object, engineKey) {
    if (!predicate || predicate.constructor !== String) throw new Error(
      `Relationship 'predicate' must be a String`);
    if (!object && !subject) throw new Error(
      `'arbitrary' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'arbitrary' relation can't explicitly have both an 'object' and a 'subject'`);
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.engineKey = engineKey;

    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  setupTop() {
    // to really get the point across
    this.predicate = 'TOP';
    this.direction = 'in';
    this.otherName = 'top';

    this.specifier = 'from';
    this.stringForm = `(top)`;
  }

  setupAny(subject, object, engineKey) {
    if (!object && !subject) throw new Error(
      `'any' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'any' relation can't explicitly have both an 'object' and a 'subject'`);
    this.subject = subject;
    this.object = object;
    this.engineKey = engineKey;

    // to get the point across
    this.predicate = 'ANY';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `(any) ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  setupRef(subject, object, engineKey) {
    if (!object && !subject) throw new Error(
      `'ref' relation must explicitly have either an 'object' or a 'subject'`);
    if (object && subject) throw new Error(
      `'ref' relation can't explicitly have both an 'object' and a 'subject'`);
    this.subject = subject;
    this.object = object;
    this.engineKey = engineKey;

    this.type = 'Ref';
    this.predicate = 'REFERENCES';
    this.direction = subject ? 'in' : 'out';
    this.otherName = subject || object;
    this.otherEngineKey = engineKey;

    this.specifier = (this.direction === 'in') ? 'from' : 'to';
    this.stringForm = `${this.predicate} ${this.direction} ${this.specifier} '${this.otherName}'`;
  }

  link(nodeCtx, resolver) {
    if (this.isLinked) throw new Error(
      `double linking a RelationBuilder is bad!`);
    this.isLinked = true;

    switch (this.kind) {
      case 'arbitrary':
        this.localType = nodeCtx;
        if (this.otherEngineKey) {
          const targetEngine = resolver.engineDeps.get(this.otherEngineKey);
          if (!targetEngine) throw new Error(
            `Can't relate to undeclared engine ${this.otherEngineKey}`);
          this.otherType = targetEngine.NodeMap.get(this.otherName);
        } else {
          this.otherType = resolver.resolveName(this.otherName);
        }
        if (!this.otherType) throw new Error(
          `Arbitrary relation ${this.stringForm} didn't resolve to a type.`);
        break;
      case 'top':
        this.topType = nodeCtx;
        break;
      case 'any':
        throw new Error(`TODO: linking any relation?`);
        break;
      case 'ref':
        this.localType = nodeCtx;
        if (this.otherEngineKey) {
          const targetEngine = resolver.engineDeps.get(this.otherEngineKey);
          if (!targetEngine) throw new Error(
            `Can't relate to undeclared engine ${this.otherEngineKey}`);
          this.otherType = targetEngine.NodeMap.get(this.otherName);
        } else {
          this.otherType = resolver.resolveName(this.otherName);
        }
        if (!this.otherType) throw new Error(
          `Ref relation ${this.stringForm} didn't resolve to a type.`);
        break;
    }
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
});
