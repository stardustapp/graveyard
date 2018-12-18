class AssertFailure extends ExtendableError {
  constructor(message) {
    super(message);
  }
}

class TestRunner {
  constructor() {
    this.suites = [];

    this.asserts = 0;
    this.passes = 0;
    this.fails = 0;
    this.crashes = 0;
  }

  addSuite(name, opts, cb) {
    if (typeof opts.constructor === 'function') {
      cb = opts;
      opts = {};
    }

    this.suites.push({name, opts, cb});
    return this;
  }

  assertEq(left, right) {
    // TODO: obj compare
    if (left !== right) {
      this.fails++;
      throw new AssertFailure(`Expected '${JSON.stringify(left)}' to equal '${JSON.stringify(right)}'`);
    }

    this.passes++;
  }

  async runAll() {
    console.group('Run All Tests');
    for (const suite of this.suites) {
      try {
        console.group('Suite:', suite.name);
        await suite.cb.call(this);
      } catch (ex) {
        if (ex.constructor !== AssertFailure) {
          console.error('Test suite crashed:', ex);
          this.crashes++;
        }
      } finally {
        console.groupEnd();
      }
    }
    console.groupEnd();

    console.info('---');
    console.group('Test Results');
    console.info('Asserts:', this.asserts);
    console.info('Passes:', this.passes);
    console[this.fails ? 'warn' : 'info']('Fails:', this.fails);
    console[this.crashes ? 'warn' : 'info']('Crashes:', this.crashes);
    console.groupEnd();

    if (this.fails || this.crashes) {
      console.error('TESTS FAILED');
    } else {
      console.info('TESTS PASSED');
    }
    console.info('---');
  }
}

const vcsTests = new TestRunner();
