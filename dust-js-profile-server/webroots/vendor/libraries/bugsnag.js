(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.bugsnag = f()}})(function(){var define,module,exports;
// minimal implementations of useful ES functionality

// all we really need for arrays is reduce – everything else is just sugar!

// Array#reduce
var reduce = function (arr, fn, accum) {
  var val = accum;
  for (var i = 0, len = arr.length; i < len; i++) {
    val = fn(val, arr[i], i, arr);
  }return val;
};

// Array#filter
var filter = function (arr, fn) {
  return reduce(arr, function (accum, item, i, arr) {
    return !fn(item, i, arr) ? accum : accum.concat(item);
  }, []);
};

// Array#map
var map = function (arr, fn) {
  return reduce(arr, function (accum, item, i, arr) {
    return accum.concat(fn(item, i, arr));
  }, []);
};

// Array#includes
var includes = function (arr, x) {
  return reduce(arr, function (accum, item, i, arr) {
    return accum === true || item === x;
  }, false);
};

var _hasDontEnumBug = !{ toString: null }.propertyIsEnumerable('toString');
var _dontEnums = ['toString', 'toLocaleString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'constructor'];

// Object#keys
var keys = function (obj) {
  // stripped down version of
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/Keys
  var result = [];
  var prop = void 0;
  for (prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) result.push(prop);
  }
  if (!_hasDontEnumBug) return result;
  for (var i = 0, len = _dontEnums.length; i < len; i++) {
    if (Object.prototype.hasOwnProperty.call(obj, _dontEnums[i])) result.push(_dontEnums[i]);
  }
  return result;
};

// Array#isArray
var isArray = function (obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
};

var _pad = function (n) {
  return n < 10 ? '0' + n : n;
};

// Date#toISOString
var isoDate = function () {
  // from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
  var d = new Date();
  return d.getUTCFullYear() + '-' + _pad(d.getUTCMonth() + 1) + '-' + _pad(d.getUTCDate()) + 'T' + _pad(d.getUTCHours()) + ':' + _pad(d.getUTCMinutes()) + ':' + _pad(d.getUTCSeconds()) + '.' + (d.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) + 'Z';
};

var _$esUtils_4 = { map: map, reduce: reduce, filter: filter, includes: includes, keys: keys, isArray: isArray, isoDate: isoDate };

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var __dummy_1$0 = 0,
    __isoDate_1 = _$esUtils_4.isoDate;

var BugsnagBreadcrumb = function () {
  function BugsnagBreadcrumb() {
    var name = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '[anonymous]';
    var metaData = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
    var type = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'manual';
    var timestamp = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : __isoDate_1();

    _classCallCheck(this, BugsnagBreadcrumb);

    this.type = type;
    this.name = name;
    this.metaData = metaData;
    this.timestamp = timestamp;
  }

  BugsnagBreadcrumb.prototype.toJSON = function toJSON() {
    return {
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
      metaData: this.metaData
    };
  };

  return BugsnagBreadcrumb;
}();

var _$BugsnagBreadcrumb_1 = BugsnagBreadcrumb;

var __dummy_7$0 = 0,
    __includes_7 = _$esUtils_4.includes;

var _$positiveIntCheck_7 = function (value) {
  return __includes_7(['undefined', 'number'], typeof value) && parseInt('' + value, 10) === value && value > 0;
};

var _$config_3 = {};
var __dummy_3$0 = 0,
    __filter_3 = _$esUtils_4.filter,
    __reduce_3 = _$esUtils_4.reduce,
    __keys_3 = _$esUtils_4.keys,
    __isArray_3 = _$esUtils_4.isArray;

/* removed: var _$positiveIntCheck_7 = require('./lib/positive-int-check'); */;

_$config_3.schema = {
  apiKey: {
    defaultValue: function () {
      return null;
    },
    message: 'is required',
    validate: function (value) {
      return typeof value === 'string' && value.length;
    }
  },
  appVersion: {
    defaultValue: function () {
      return null;
    },
    message: 'should be a string',
    validate: function (value) {
      return value === null || typeof value === 'string' && value.length;
    }
  },
  autoNotify: {
    defaultValue: function () {
      return true;
    },
    message: 'should be true|false',
    validate: function (value) {
      return value === true || value === false;
    }
  },
  beforeSend: {
    defaultValue: function () {
      return [];
    },
    message: 'should be a function or array of functions',
    validate: function (value) {
      return typeof value === 'function' || __isArray_3(value) && __filter_3(value, function (f) {
        return typeof f === 'function';
      }).length === value.length;
    }
  },
  endpoint: {
    defaultValue: function () {
      return 'https://notify.bugsnag.com';
    },
    message: 'should be a URL',
    validate: function () {
      return true;
    }
  },
  sessionEndpoint: {
    defaultValue: function () {
      return 'https://sessions.bugsnag.com';
    },
    message: 'should be a URL',
    validate: function () {
      return true;
    }
  },
  autoCaptureSessions: {
    defaultValue: function () {
      return false;
    },
    message: 'should be true|false',
    validate: function (val) {
      return val === true || val === false;
    }
  },
  notifyReleaseStages: {
    defaultValue: function () {
      return null;
    },
    message: 'should be an array of strings',
    validate: function (value) {
      return value === null || __isArray_3(value) && __filter_3(value, function (f) {
        return typeof f === 'string';
      }).length === value.length;
    }
  },
  releaseStage: {
    defaultValue: function () {
      return 'production';
    },
    message: 'should be a string',
    validate: function (value) {
      return typeof value === 'string' && value.length;
    }
  },
  maxBreadcrumbs: {
    defaultValue: function () {
      return 20;
    },
    message: 'should be a number ≤40',
    validate: function (value) {
      return value === 0 || _$positiveIntCheck_7(value) && (value === undefined || value <= 40);
    }
  },
  autoBreadcrumbs: {
    defaultValue: function () {
      return true;
    },
    message: 'should be true|false',
    validate: function (value) {
      return typeof value === 'boolean';
    }
  },
  user: {
    defaultValue: function () {
      return null;
    },
    message: '(object) user should be an object',
    validate: function (value) {
      return typeof value === 'object';
    }
  },
  metaData: {
    defaultValue: function () {
      return null;
    },
    message: 'should be an object',
    validate: function (value) {
      return typeof value === 'object';
    }
  },
  logger: {
    defaultValue: function () {
      return undefined;
    },
    message: 'should be null or an object with methods { debug, info, warn, error }',
    validate: function (value) {
      return !value || value && __reduce_3(['debug', 'info', 'warn', 'error'], function (accum, method) {
        return accum && typeof value[method] === 'function';
      }, true);
    }
  }
};

_$config_3.mergeDefaults = function (opts, schema) {
  if (!opts || !schema) throw new Error('schema.mergeDefaults(opts, schema): opts and schema objects are required');
  return __reduce_3(__keys_3(schema), function (accum, key) {
    accum[key] = opts[key] !== undefined ? opts[key] : schema[key].defaultValue();
    return accum;
  }, {});
};

_$config_3.validate = function (opts, schema) {
  if (!opts || !schema) throw new Error('schema.mergeDefaults(opts, schema): opts and schema objects are required');
  var errors = __reduce_3(__keys_3(schema), function (accum, key) {
    if (schema[key].validate(opts[key])) return accum;
    return accum.concat({ key: key, message: schema[key].message, value: opts[key] });
  }, []);
  return { valid: !errors.length, errors: errors };
};

var _$inferReleaseStage_6 = function (client) {
  return client.app && typeof client.app.releaseStage === 'string' ? client.app.releaseStage : client.config.releaseStage;
};

// Given `err` which may be an error, does it have a stack property which is a string?
var _$hasStack_5 = function (err) {
  return !!err && (!!err.stack || !!err.stacktrace || !!err['opera#sourceloc']) && typeof (err.stack || err.stacktrace || err['opera#sourceloc']) === 'string';
};

var _$stackframe_36 = {};
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.

    /* istanbul ignore next */

    if (typeof define === 'function' && define.amd) {
        define('stackframe', [], factory);
    } else if (typeof _$stackframe_36 === 'object') {
        _$stackframe_36 = factory();
    } else {
        root.StackFrame = factory();
    }
})(this, function () {
    'use strict';

    function _isNumber(n) {
        return !isNaN(parseFloat(n)) && isFinite(n);
    }

    function _capitalize(str) {
        return str.charAt(0).toUpperCase() + str.substring(1);
    }

    function _getter(p) {
        return function () {
            return this[p];
        };
    }

    var booleanProps = ['isConstructor', 'isEval', 'isNative', 'isToplevel'];
    var numericProps = ['columnNumber', 'lineNumber'];
    var stringProps = ['fileName', 'functionName', 'source'];
    var arrayProps = ['args'];

    var props = booleanProps.concat(numericProps, stringProps, arrayProps);

    function StackFrame(obj) {
        if (obj instanceof Object) {
            for (var i = 0; i < props.length; i++) {
                if (obj.hasOwnProperty(props[i]) && obj[props[i]] !== undefined) {
                    this['set' + _capitalize(props[i])](obj[props[i]]);
                }
            }
        }
    }

    StackFrame.prototype = {
        getArgs: function () {
            return this.args;
        },
        setArgs: function (v) {
            if (Object.prototype.toString.call(v) !== '[object Array]') {
                throw new TypeError('Args must be an Array');
            }
            this.args = v;
        },

        getEvalOrigin: function () {
            return this.evalOrigin;
        },
        setEvalOrigin: function (v) {
            if (v instanceof StackFrame) {
                this.evalOrigin = v;
            } else if (v instanceof Object) {
                this.evalOrigin = new StackFrame(v);
            } else {
                throw new TypeError('Eval Origin must be an Object or StackFrame');
            }
        },

        toString: function () {
            var functionName = this.getFunctionName() || '{anonymous}';
            var args = '(' + (this.getArgs() || []).join(',') + ')';
            var fileName = this.getFileName() ? '@' + this.getFileName() : '';
            var lineNumber = _isNumber(this.getLineNumber()) ? ':' + this.getLineNumber() : '';
            var columnNumber = _isNumber(this.getColumnNumber()) ? ':' + this.getColumnNumber() : '';
            return functionName + args + fileName + lineNumber + columnNumber;
        }
    };

    for (var i = 0; i < booleanProps.length; i++) {
        StackFrame.prototype['get' + _capitalize(booleanProps[i])] = _getter(booleanProps[i]);
        StackFrame.prototype['set' + _capitalize(booleanProps[i])] = function (p) {
            return function (v) {
                this[p] = Boolean(v);
            };
        }(booleanProps[i]);
    }

    for (var j = 0; j < numericProps.length; j++) {
        StackFrame.prototype['get' + _capitalize(numericProps[j])] = _getter(numericProps[j]);
        StackFrame.prototype['set' + _capitalize(numericProps[j])] = function (p) {
            return function (v) {
                if (!_isNumber(v)) {
                    throw new TypeError(p + ' must be a Number');
                }
                this[p] = Number(v);
            };
        }(numericProps[j]);
    }

    for (var k = 0; k < stringProps.length; k++) {
        StackFrame.prototype['get' + _capitalize(stringProps[k])] = _getter(stringProps[k]);
        StackFrame.prototype['set' + _capitalize(stringProps[k])] = function (p) {
            return function (v) {
                this[p] = String(v);
            };
        }(stringProps[k]);
    }

    return StackFrame;
});

var _$errorStackParser_33 = {};
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.

    /* istanbul ignore next */

    if (typeof define === 'function' && define.amd) {
        define('error-stack-parser', ['stackframe'], factory);
    } else if (typeof _$errorStackParser_33 === 'object') {
        _$errorStackParser_33 = factory(_$stackframe_36);
    } else {
        root.ErrorStackParser = factory(root.StackFrame);
    }
})(this, function ErrorStackParser(StackFrame) {
    'use strict';

    var FIREFOX_SAFARI_STACK_REGEXP = /(^|@)\S+\:\d+/;
    var CHROME_IE_STACK_REGEXP = /^\s*at .*(\S+\:\d+|\(native\))/m;
    var SAFARI_NATIVE_CODE_REGEXP = /^(eval@)?(\[native code\])?$/;

    return {
        /**
         * Given an Error object, extract the most information from it.
         *
         * @param {Error} error object
         * @return {Array} of StackFrames
         */
        parse: function ErrorStackParser$$parse(error) {
            if (typeof error.stacktrace !== 'undefined' || typeof error['opera#sourceloc'] !== 'undefined') {
                return this.parseOpera(error);
            } else if (error.stack && error.stack.match(CHROME_IE_STACK_REGEXP)) {
                return this.parseV8OrIE(error);
            } else if (error.stack) {
                return this.parseFFOrSafari(error);
            } else {
                throw new Error('Cannot parse given Error object');
            }
        },

        // Separate line and column numbers from a string of the form: (URI:Line:Column)
        extractLocation: function ErrorStackParser$$extractLocation(urlLike) {
            // Fail-fast but return locations like "(native)"
            if (urlLike.indexOf(':') === -1) {
                return [urlLike];
            }

            var regExp = /(.+?)(?:\:(\d+))?(?:\:(\d+))?$/;
            var parts = regExp.exec(urlLike.replace(/[\(\)]/g, ''));
            return [parts[1], parts[2] || undefined, parts[3] || undefined];
        },

        parseV8OrIE: function ErrorStackParser$$parseV8OrIE(error) {
            var filtered = error.stack.split('\n').filter(function (line) {
                return !!line.match(CHROME_IE_STACK_REGEXP);
            }, this);

            return filtered.map(function (line) {
                if (line.indexOf('(eval ') > -1) {
                    // Throw away eval information until we implement stacktrace.js/stackframe#8
                    line = line.replace(/eval code/g, 'eval').replace(/(\(eval at [^\()]*)|(\)\,.*$)/g, '');
                }
                var tokens = line.replace(/^\s+/, '').replace(/\(eval code/g, '(').split(/\s+/).slice(1);
                var locationParts = this.extractLocation(tokens.pop());
                var functionName = tokens.join(' ') || undefined;
                var fileName = ['eval', '<anonymous>'].indexOf(locationParts[0]) > -1 ? undefined : locationParts[0];

                return new StackFrame({
                    functionName: functionName,
                    fileName: fileName,
                    lineNumber: locationParts[1],
                    columnNumber: locationParts[2],
                    source: line
                });
            }, this);
        },

        parseFFOrSafari: function ErrorStackParser$$parseFFOrSafari(error) {
            var filtered = error.stack.split('\n').filter(function (line) {
                return !line.match(SAFARI_NATIVE_CODE_REGEXP);
            }, this);

            return filtered.map(function (line) {
                // Throw away eval information until we implement stacktrace.js/stackframe#8
                if (line.indexOf(' > eval') > -1) {
                    line = line.replace(/ line (\d+)(?: > eval line \d+)* > eval\:\d+\:\d+/g, ':$1');
                }

                if (line.indexOf('@') === -1 && line.indexOf(':') === -1) {
                    // Safari eval frames only have function names and nothing else
                    return new StackFrame({
                        functionName: line
                    });
                } else {
                    var tokens = line.split('@');
                    var locationParts = this.extractLocation(tokens.pop());
                    var functionName = tokens.join('@') || undefined;

                    return new StackFrame({
                        functionName: functionName,
                        fileName: locationParts[0],
                        lineNumber: locationParts[1],
                        columnNumber: locationParts[2],
                        source: line
                    });
                }
            }, this);
        },

        parseOpera: function ErrorStackParser$$parseOpera(e) {
            if (!e.stacktrace || e.message.indexOf('\n') > -1 && e.message.split('\n').length > e.stacktrace.split('\n').length) {
                return this.parseOpera9(e);
            } else if (!e.stack) {
                return this.parseOpera10(e);
            } else {
                return this.parseOpera11(e);
            }
        },

        parseOpera9: function ErrorStackParser$$parseOpera9(e) {
            var lineRE = /Line (\d+).*script (?:in )?(\S+)/i;
            var lines = e.message.split('\n');
            var result = [];

            for (var i = 2, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(new StackFrame({
                        fileName: match[2],
                        lineNumber: match[1],
                        source: lines[i]
                    }));
                }
            }

            return result;
        },

        parseOpera10: function ErrorStackParser$$parseOpera10(e) {
            var lineRE = /Line (\d+).*script (?:in )?(\S+)(?:: In function (\S+))?$/i;
            var lines = e.stacktrace.split('\n');
            var result = [];

            for (var i = 0, len = lines.length; i < len; i += 2) {
                var match = lineRE.exec(lines[i]);
                if (match) {
                    result.push(new StackFrame({
                        functionName: match[3] || undefined,
                        fileName: match[2],
                        lineNumber: match[1],
                        source: lines[i]
                    }));
                }
            }

            return result;
        },

        // Opera 10.65+ Error.stack very similar to FF/Safari
        parseOpera11: function ErrorStackParser$$parseOpera11(error) {
            var filtered = error.stack.split('\n').filter(function (line) {
                return !!line.match(FIREFOX_SAFARI_STACK_REGEXP) && !line.match(/^Error created at/);
            }, this);

            return filtered.map(function (line) {
                var tokens = line.split('@');
                var locationParts = this.extractLocation(tokens.pop());
                var functionCall = tokens.shift() || '';
                var functionName = functionCall.replace(/<anonymous function(: (\w+))?>/, '$2').replace(/\([^\)]*\)/g, '') || undefined;
                var argsRaw;
                if (functionCall.match(/\(([^\)]*)\)/)) {
                    argsRaw = functionCall.replace(/^[^\(]+\(([^\)]*)\)$/, '$1');
                }
                var args = argsRaw === undefined || argsRaw === '[arguments not available]' ? undefined : argsRaw.split(',');

                return new StackFrame({
                    functionName: functionName,
                    args: args,
                    fileName: locationParts[0],
                    lineNumber: locationParts[1],
                    columnNumber: locationParts[2],
                    source: line
                });
            }, this);
        }
    };
});

var _$stackGenerator_35 = {};
(function (root, factory) {
    'use strict';
    // Universal Module Definition (UMD) to support AMD, CommonJS/Node.js, Rhino, and browsers.

    /* istanbul ignore next */

    if (typeof define === 'function' && define.amd) {
        define('stack-generator', ['stackframe'], factory);
    } else if (typeof _$stackGenerator_35 === 'object') {
        _$stackGenerator_35 = factory(_$stackframe_36);
    } else {
        root.StackGenerator = factory(root.StackFrame);
    }
})(this, function (StackFrame) {
    return {
        backtrace: function StackGenerator$$backtrace(opts) {
            var stack = [];
            var maxStackSize = 10;

            if (typeof opts === 'object' && typeof opts.maxStackSize === 'number') {
                maxStackSize = opts.maxStackSize;
            }

            var curr = arguments.callee;
            while (curr && stack.length < maxStackSize) {
                if (!curr['arguments']) {
                    break;
                }
                // Allow V8 optimizations
                var args = new Array(curr['arguments'].length);
                for (var i = 0; i < args.length; ++i) {
                    args[i] = curr['arguments'][i];
                }
                if (/function(?:\s+([\w$]+))+\s*\(/.test(curr.toString())) {
                    stack.push(new StackFrame({ functionName: RegExp.$1 || undefined, args: args }));
                } else {
                    stack.push(new StackFrame({ args: args }));
                }

                try {
                    curr = curr.caller;
                } catch (e) {
                    break;
                }
            }
            return stack;
        }
    };
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function ___classCallCheck_9(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* removed: var _$errorStackParser_33 = require('error-stack-parser'); */;
/* removed: var _$stackGenerator_35 = require('stack-generator'); */;
/* removed: var _$hasStack_5 = require('./lib/has-stack'); */;

var __dummy_9$0 = 0,
    __reduce_9 = _$esUtils_4.reduce,
    __filter_9 = _$esUtils_4.filter;

var BugsnagReport = function () {
  function BugsnagReport(errorClass, errorMessage) {
    var stacktrace = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];
    var handledState = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : defaultHandledState();

    ___classCallCheck_9(this, BugsnagReport);

    // duck-typing ftw >_<
    this.__isBugsnagReport = true;

    this._ignored = false;

    // private (un)handled state
    this._handledState = handledState;

    // setable props
    this.app = undefined;
    this.apiKey = undefined;
    this.breadcrumbs = [];
    this.context = undefined;
    this.device = undefined;
    this.errorClass = stringOrFallback(errorClass, '[no error class]');
    this.errorMessage = stringOrFallback(errorMessage, '[no error message]');
    this.groupingHash = undefined;
    this.metaData = {};
    this.request = undefined;
    this.severity = this._handledState.severity;
    this.stacktrace = __reduce_9(stacktrace, function (accum, frame) {
      var f = formatStackframe(frame);
      // don't include a stackframe if none of its properties are defined
      try {
        if (JSON.stringify(f) === '{}') return accum;
        return accum.concat(f);
      } catch (e) {
        return accum;
      }
    }, []);
    this.user = undefined;
    this.session = undefined;
  }

  BugsnagReport.prototype.ignore = function ignore() {
    this._ignored = true;
  };

  BugsnagReport.prototype.isIgnored = function isIgnored() {
    return this._ignored;
  };

  BugsnagReport.prototype.updateMetaData = function updateMetaData(section) {
    var _updates;

    if (!section) return this;
    var updates = void 0;

    // updateMetaData("section", null) -> removes section
    if ((arguments.length <= 1 ? undefined : arguments[1]) === null) return this.removeMetaData(section);

    // updateMetaData("section", "property", null) -> removes property from section
    if ((arguments.length <= 2 ? undefined : arguments[2]) === null) return this.removeMetaData(section, arguments.length <= 1 ? undefined : arguments[1], arguments.length <= 2 ? undefined : arguments[2]);

    // normalise the two supported input types into object form
    if (typeof (arguments.length <= 1 ? undefined : arguments[1]) === 'object') updates = arguments.length <= 1 ? undefined : arguments[1];
    if (typeof (arguments.length <= 1 ? undefined : arguments[1]) === 'string') updates = (_updates = {}, _updates[arguments.length <= 1 ? undefined : arguments[1]] = arguments.length <= 2 ? undefined : arguments[2], _updates);

    // exit if we don't have an updates object at this point
    if (!updates) return this;

    // ensure a section with this name exists
    if (!this.metaData[section]) this.metaData[section] = {};

    // merge the updates with the existing section
    this.metaData[section] = _extends({}, this.metaData[section], updates);

    return this;
  };

  BugsnagReport.prototype.removeMetaData = function removeMetaData(section, property) {
    if (typeof section !== 'string') return this;

    // remove an entire section
    if (!property) {
      delete this.metaData[section];
      return this;
    }

    // remove a single property from a section
    if (this.metaData[section]) {
      delete this.metaData[section][property];
      return this;
    }

    return this;
  };

  BugsnagReport.prototype.toJSON = function toJSON() {
    return {
      payloadVersion: '4',
      exceptions: [{
        errorClass: this.errorClass,
        message: this.errorMessage,
        stacktrace: this.stacktrace,
        type: 'browserjs'
      }],
      severity: this.severity,
      unhandled: this._handledState.unhandled,
      severityReason: this._handledState.severityReason,
      app: this.app,
      device: this.device,
      breadcrumbs: this.breadcrumbs,
      context: this.context,
      user: this.user,
      metaData: this.metaData,
      groupingHash: this.groupingHash,
      request: this.request,
      session: this.session
    };
  };

  return BugsnagReport;
}();

// takes a stacktrace.js style stackframe (https://github.com/stacktracejs/stackframe)
// and returns a Bugsnag compatible stackframe (https://docs.bugsnag.com/api/error-reporting/#json-payload)


var formatStackframe = function (frame) {
  var f = {
    file: frame.fileName,
    method: normaliseFunctionName(frame.functionName),
    lineNumber: frame.lineNumber,
    columnNumber: frame.columnNumber,
    code: undefined,
    inProject: undefined
    // Some instances result in no file:
    // - calling notify() from chrome's terminal results in no file/method.
    // - non-error exception thrown from global code in FF
    // This adds one.
  };if (f.lineNumber > -1 && !f.file && !f.method) {
    f.file = 'global code';
  }
  return f;
};

var normaliseFunctionName = function (name) {
  return (/^global code$/i.test(name) ? 'global code' : name
  );
};

var defaultHandledState = function () {
  return {
    unhandled: false,
    severity: 'warning',
    severityReason: { type: 'handledException' }
  };
};

var stringOrFallback = function (str, fallback) {
  return typeof str === 'string' && str ? str : fallback;
};

// Helpers

BugsnagReport.getStacktrace = function (error) {
  var errorFramesToSkip = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var generatedFramesToSkip = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

  if (_$hasStack_5(error)) return _$errorStackParser_33.parse(error).slice(errorFramesToSkip);
  // error wasn't provided or didn't have a stacktrace so try to walk the callstack
  return __filter_9(_$stackGenerator_35.backtrace(), function (frame) {
    return (frame.functionName || '').indexOf('StackGenerator$$') === -1;
  }).slice(1 + generatedFramesToSkip);
};

BugsnagReport.ensureReport = function (reportOrError) {
  var errorFramesToSkip = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  var generatedFramesToSkip = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

  // notify() can be called with a Report object. In this case no action is required
  if (reportOrError.__isBugsnagReport) return reportOrError;
  try {
    var stacktrace = BugsnagReport.getStacktrace(reportOrError, errorFramesToSkip, 1 + generatedFramesToSkip);
    return new BugsnagReport(reportOrError.name, reportOrError.message, stacktrace);
  } catch (e) {
    return new BugsnagReport(reportOrError.name, reportOrError.message, []);
  }
};

var _$BugsnagReport_9 = BugsnagReport;

var _$pad_31 = function pad(num, size) {
  var s = '000000000' + num;
  return s.substr(s.length - size);
};

/* removed: var _$pad_31 = require('./pad.js'); */;

var env = typeof window === 'object' ? window : self;
var globalCount = 0;
for (var prop in env) {
  if (Object.hasOwnProperty.call(env, prop)) globalCount++;
}
var mimeTypesLength = navigator.mimeTypes ? navigator.mimeTypes.length : 0;
var clientId = _$pad_31((mimeTypesLength + navigator.userAgent.length).toString(36) + globalCount.toString(36), 4);

var _$fingerprint_30 = function fingerprint() {
  return clientId;
};

/**
 * cuid.js
 * Collision-resistant UID generator for browsers and node.
 * Sequential for fast db lookups and recency sorting.
 * Safe for element IDs and server-side lookups.
 *
 * Extracted from CLCTR
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 */

/* removed: var _$fingerprint_30 = require('./lib/fingerprint.js'); */;
/* removed: var _$pad_31 = require('./lib/pad.js'); */;

var c = 0,
    blockSize = 4,
    base = 36,
    discreteValues = Math.pow(base, blockSize);

function randomBlock() {
  return _$pad_31((Math.random() * discreteValues << 0).toString(base), blockSize);
}

function safeCounter() {
  c = c < discreteValues ? c : 0;
  c++; // this is not subliminal
  return c - 1;
}

function cuid() {
  // Starting with a lowercase letter makes
  // it HTML element ID friendly.
  var letter = 'c',
      // hard-coded allows for sequential access

  // timestamp
  // warning: this exposes the exact date and time
  // that the uid was created.
  timestamp = new Date().getTime().toString(base),


  // Prevent same-machine collisions.
  counter = _$pad_31(safeCounter().toString(base), blockSize),


  // A few chars to generate distinct ids for different
  // clients (so different computers are far less
  // likely to generate the same id)
  print = _$fingerprint_30(),


  // Grab some more chars from Math.random()
  random = randomBlock() + randomBlock();

  return letter + timestamp + counter + print + random;
}

cuid.fingerprint = _$fingerprint_30;

var _$cuid_29 = cuid;

function ___classCallCheck_10(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var __dummy_10$0 = 0,
    __isoDate_10 = _$esUtils_4.isoDate;

/* removed: var _$cuid_29 = require('@bugsnag/cuid'); */;

var Session = function () {
  function Session() {
    ___classCallCheck_10(this, Session);

    this.id = _$cuid_29();
    this.startedAt = __isoDate_10();
    this._handled = 0;
    this._unhandled = 0;
  }

  Session.prototype.toJSON = function toJSON() {
    return {
      id: this.id,
      startedAt: this.startedAt,
      events: { handled: this._handled, unhandled: this._unhandled }
    };
  };

  Session.prototype.trackError = function trackError(report) {
    this[report._handledState.unhandled ? '_unhandled' : '_handled'] += 1;
  };

  return Session;
}();

var _$Session_10 = Session;


/**
 * Expose `isError`.
 */

var _$isError_34 = isError;

/**
 * Test whether `value` is error object.
 *
 * @param {*} value
 * @returns {boolean}
 */

function isError(value) {
  switch (Object.prototype.toString.call(value)) {
    case '[object Error]':
      return true;
    case '[object Exception]':
      return true;
    case '[object DOMException]':
      return true;
    default:
      return value instanceof Error;
  }
}

var ___extends_2 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function ___classCallCheck_2(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

/* removed: var _$config_3 = require('./config'); */;
/* removed: var _$BugsnagReport_9 = require('./report'); */;
/* removed: var _$BugsnagBreadcrumb_1 = require('./breadcrumb'); */;
/* removed: var _$Session_10 = require('./session'); */;

var __dummy_2$0 = 0,
    __map_2 = _$esUtils_4.map,
    __reduce_2 = _$esUtils_4.reduce,
    __includes_2 = _$esUtils_4.includes,
    __isArray_2 = _$esUtils_4.isArray;

/* removed: var _$inferReleaseStage_6 = require('./lib/infer-release-stage'); */;
/* removed: var _$isError_34 = require('iserror'); */;

var noop = function () {};

var BugsnagClient = function () {
  function BugsnagClient(notifier) {
    var configSchema = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _$config_3.schema;
    var session = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

    ___classCallCheck_2(this, BugsnagClient);

    if (!notifier) throw new Error('new BugsnagClient(notifier, configSchema) requires `notifier` argument');
    if (!notifier.name || !notifier.version || !notifier.url) {
      throw new Error('new BugsnagClient(notifier, configSchema) - `notifier` requires: `{ name, version, url }`');
    }

    // notifier id
    this.notifier = notifier;

    // config
    this.configSchema = configSchema;

    // configure() should be called before notify()
    this._configured = false;

    // i/o
    this._transport = { name: 'NULL_TRANSPORT', sendSession: noop, sendReport: noop };
    this._logger = { debug: noop, info: noop, warn: noop, error: noop

      // plugins
    };this.plugins = [];

    this.session = session;
    this.beforeSession = [];

    this.breadcrumbs = [];

    // setable props
    this.app = {};
    this.context = undefined;
    this.device = undefined;
    this.metaData = undefined;
    this.request = undefined;
    this.user = {};

    // expose internal constructors
    this.BugsnagReport = _$BugsnagReport_9;
    this.BugsnagBreadcrumb = _$BugsnagBreadcrumb_1;
    this.BugsnagSession = _$Session_10;
  }

  BugsnagClient.prototype.configure = function configure() {
    var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    this.config = _$config_3.mergeDefaults(___extends_2({}, this.config, opts), this.configSchema);
    var validity = _$config_3.validate(this.config, this.configSchema);
    if (!validity.valid === true) {
      var err = new Error('Bugsnag configuration error');
      err.errors = __map_2(validity.errors, function (err) {
        return err.key + ' ' + err.message + ' \n  ' + err.value;
      });
      throw err;
    }
    if (typeof this.config.beforeSend === 'function') this.config.beforeSend = [this.config.beforeSend];
    if (this.config.appVersion !== null) this.app.version = this.config.appVersion;
    if (this.config.metaData) this.metaData = this.config.metaData;
    if (this.config.user) this.user = this.config.user;
    if (this.config.logger) this.logger(this.config.logger);
    this._configured = true;
    this._logger.debug('Loaded!');
    return this;
  };

  BugsnagClient.prototype.use = function use(plugin) {
    this.plugins.push(plugin);
    return plugin.init(this);
  };

  BugsnagClient.prototype.transport = function transport(t) {
    this._transport = t;
    return this;
  };

  BugsnagClient.prototype.logger = function logger(l, sid) {
    this._logger = l;
    return this;
  };

  BugsnagClient.prototype.sessionDelegate = function sessionDelegate(s) {
    this._sessionDelegate = s;
    return this;
  };

  BugsnagClient.prototype.startSession = function startSession() {
    if (!this._sessionDelegate) {
      this._logger.warn('No session implementation is installed');
      return this;
    }
    return this._sessionDelegate.startSession(this);
  };

  BugsnagClient.prototype.leaveBreadcrumb = function leaveBreadcrumb(name, metaData, type, timestamp) {
    if (!this._configured) throw new Error('Bugsnag must be configured before calling leaveBreadcrumb()');

    // coerce bad values so that the defaults get set
    name = name || undefined;
    type = typeof type === 'string' ? type : undefined;
    timestamp = typeof timestamp === 'string' ? timestamp : undefined;
    metaData = typeof metaData === 'object' && metaData !== null ? metaData : undefined;

    // if no name and no metaData, usefulness of this crumb is questionable at best so discard
    if (typeof name !== 'string' && !metaData) return;

    var crumb = new _$BugsnagBreadcrumb_1(name, metaData, type, timestamp);

    // push the valid crumb onto the queue and maintain the length
    this.breadcrumbs.push(crumb);
    if (this.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(this.breadcrumbs.length - this.config.maxBreadcrumbs);
    }

    return this;
  };

  BugsnagClient.prototype.notify = function notify(error) {
    var opts = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    if (!this._configured) throw new Error('Bugsnag must be configured before calling report()');

    // releaseStage can be set via config.releaseStage or client.app.releaseStage
    var releaseStage = _$inferReleaseStage_6(this);

    // ensure we have an error (or a reasonable object representation of an error)

    var _normaliseError = normaliseError(error, opts, this._logger),
        err = _normaliseError.err,
        errorFramesToSkip = _normaliseError.errorFramesToSkip,
        _opts = _normaliseError._opts;

    if (_opts) opts = _opts;

    // if we have something falsey at this point, report usage error
    if (!err) {
      this._logger.warn('Usage error. notify() called with no "error" parameter');
      err = new Error('Bugsnag usage error. notify() called with no "error" parameter');
    }

    // ensure opts is an object
    if (typeof opts !== 'object' || opts === null) opts = {};

    // create a report from the error, if it isn't one already
    var report = _$BugsnagReport_9.ensureReport(err, errorFramesToSkip, 1);

    report.app = ___extends_2({ releaseStage: releaseStage }, report.app, this.app);
    report.context = report.context || opts.context || this.context || undefined;
    report.device = ___extends_2({}, report.device, this.device, opts.device);
    report.request = ___extends_2({}, report.request, this.request, opts.request);
    report.user = ___extends_2({}, report.user, this.user, opts.user);
    report.metaData = ___extends_2({}, report.metaData, this.metaData, opts.metaData);
    report.breadcrumbs = this.breadcrumbs.slice(0);

    if (this.session) {
      this.session.trackError(report);
      report.session = this.session;
    }

    // set severity if supplied
    if (opts.severity !== undefined) {
      report.severity = opts.severity;
      report._handledState.severityReason = { type: 'userSpecifiedSeverity' };
    }

    // exit early if the reports should not be sent on the current releaseStage
    if (__isArray_2(this.config.notifyReleaseStages) && !__includes_2(this.config.notifyReleaseStages, releaseStage)) {
      this._logger.warn('Report not sent due to releaseStage/notifyReleaseStages configuration');
      return false;
    }

    var originalSeverity = report.severity;

    var beforeSend = [].concat(opts.beforeSend).concat(this.config.beforeSend);
    var preventSend = __reduce_2(beforeSend, function (accum, fn) {
      if (accum === true) return true;
      if (typeof fn === 'function' && fn(report) === false) return true;
      if (report.isIgnored()) return true;
      return false;
    }, false);

    if (preventSend) {
      this._logger.debug('Report not sent due to beforeSend callback');
      return false;
    }

    // only leave a crumb for the error if actually got sent
    if (this.config.autoBreadcrumbs) {
      this.leaveBreadcrumb(report.errorClass, {
        errorClass: report.errorClass,
        errorMessage: report.errorMessage,
        severity: report.severity,
        stacktrace: report.stacktrace
      }, 'error');
    }

    if (originalSeverity !== report.severity) {
      report._handledState.severityReason = { type: 'userCallbackSetSeverity' };
    }

    this._transport.sendReport(this._logger, this.config, {
      apiKey: report.apiKey || this.config.apiKey,
      notifier: this.notifier,
      events: [report]
    });

    return true;
  };

  return BugsnagClient;
}();

var normaliseError = function (error, opts, logger) {
  var err = void 0;
  var errorFramesToSkip = 0;
  var _opts = void 0;
  switch (typeof error) {
    case 'string':
      if (typeof opts === 'string') {
        // ≤v3 used to have a notify('ErrorName', 'Error message') interface
        // report usage/deprecation errors if this function is called like that
        logger.warn('Usage error. notify() called with (string, string) but expected (error, object)');
        err = new Error('Bugsnag usage error. notify() called with (string, string) but expected (error, object)');
        _opts = { metaData: { notifier: { notifyArgs: [error, opts] } } };
      } else {
        err = new Error(String(error));
        errorFramesToSkip += 2;
      }
      break;
    case 'number':
    case 'boolean':
      err = new Error(String(error));
      break;
    case 'function':
      logger.warn('Usage error. notify() called with a function as "error" parameter');
      err = new Error('Bugsnag usage error. notify() called with a function as "error" parameter');
      break;
    case 'object':
      if (error !== null && (_$isError_34(error) || error.__isBugsnagReport)) {
        err = error;
      } else if (error !== null && hasNecessaryFields(error)) {
        err = new Error(error.message || error.errorMessage);
        err.name = error.name || error.errorClass;
        errorFramesToSkip += 2;
      } else {
        logger.warn('Usage error. notify() called with an unsupported object as "error" parameter. Supply an Error or { name, message } object.');
        err = new Error('Bugsnag usage error. notify() called with an unsupported object as "error" parameter. Supply an Error or { name, message } object.');
      }
      break;
  }
  return { err: err, errorFramesToSkip: errorFramesToSkip, _opts: _opts };
};

var hasNecessaryFields = function (error) {
  return (typeof error.name === 'string' || typeof error.errorClass === 'string') && (typeof error.message === 'string' || typeof error.errorMessage === 'string');
};

var _$BugsnagClient_2 = BugsnagClient;

/* removed: var _$positiveIntCheck_7 = require('../lib/positive-int-check'); */;

/*
 * Throttles and dedupes error reports
 */

var _$throttle_8 = {
  init: function (client) {
    // track sent events for each init of the plugin
    var n = 0;

    // add beforeSend hook
    client.config.beforeSend.push(function (report) {
      // have max events been sent already?
      if (n >= client.config.maxEvents) return report.ignore();
      n++;
    });

    client.refresh = function () {
      n = 0;
    };
  },
  configSchema: {
    maxEvents: {
      defaultValue: function () {
        return 10;
      },
      message: 'should be a positive integer ≤100',
      validate: function (val) {
        return _$positiveIntCheck_7(val) && val < 100;
      }
    }
  }
};

var ___extends_11 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var __dummy_11$0 = 0,
    schema = _$config_3.schema;

var __dummy_11$1 = 0,
    __map_11 = _$esUtils_4.map;

var _$config_11 = {
  releaseStage: {
    defaultValue: function () {
      if (/^localhost(:\d+)?$/.test(window.location.host)) return 'development';
      return 'production';
    },
    message: '(string) releaseStage should be set',
    validate: function (value) {
      return typeof value === 'string' && value.length;
    }
  },
  collectUserIp: {
    defaultValue: function () {
      return true;
    },
    message: '(boolean) collectUserIp should true/false',
    validate: function (value) {
      return value === true || value === false;
    }
  },
  logger: ___extends_11({}, schema.logger, {
    defaultValue: function () {
      return (
        // set logger based on browser capability
        typeof console !== 'undefined' && typeof console.debug === 'function' ? getPrefixedConsole() : undefined
      );
    }
  })
};

var getPrefixedConsole = function () {
  var logger = {};
  var consoleLog = console['log'];
  __map_11(['debug', 'info', 'warn', 'error'], function (method) {
    var consoleMethod = console[method];
    logger[method] = typeof consoleMethod === 'function' ? consoleMethod.bind(console, '[bugsnag]') : consoleLog.bind(console, '[bugsnag]');
  });
  return logger;
};

var _$consoleBreadcrumbs_13 = {};
var __dummy_13$0 = 0,
    __map_13 = _$esUtils_4.map,
    __reduce_13 = _$esUtils_4.reduce,
    __filter_13 = _$esUtils_4.filter;

/*
 * Leaves breadcrumbs when console log methods are called
 */


_$consoleBreadcrumbs_13.init = function (client) {
  __map_13(CONSOLE_LOG_METHODS, function (method) {
    var original = console[method];
    console[method] = function () {
      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      client.leaveBreadcrumb('Console output', __reduce_13(args, function (accum, arg, i) {
        // do the best/simplest stringification of each argument
        var stringified = String(arg);
        // if it stringifies to [object Object] attempt to JSON stringify
        if (stringified === '[object Object]') {
          // catch stringify errors and fallback to [object Object]
          try {
            stringified = JSON.stringify(arg);
          } catch (e) {}
        }
        accum['[' + i + ']'] = stringified;
        return accum;
      }, {
        severity: method.indexOf('group') === 0 ? 'log' : method
      }), 'log');
      original.apply(console, args);
    };
    console[method]._restore = function () {
      console[method] = original;
    };
  });
};

_$consoleBreadcrumbs_13.configSchema = {
  consoleBreadcrumbsEnabled: {
    defaultValue: function () {
      return undefined;
    },
    validate: function (value) {
      return value === true || value === false || value === undefined;
    },
    message: 'should be true|false'
  }
};

if ("production" !== 'production') {
  _$consoleBreadcrumbs_13.destroy = function () {
    return CONSOLE_LOG_METHODS.forEach(function (method) {
      if (typeof console[method]._restore === 'function') console[method]._restore();
    });
  };
}

var CONSOLE_LOG_METHODS = __filter_13(['log', 'debug', 'info', 'warn', 'error'], function (method) {
  return typeof console !== 'undefined' && typeof console[method] === 'function';
});

/*
 * Sets the default context to be the current URL
 */
var _$context_14 = {
  init: function (client) {
    client.config.beforeSend.unshift(function (report) {
      if (report.context) return;
      report.context = window.location.pathname;
    });
  }
};

var ___extends_15 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var __dummy_15$0 = 0,
    __isoDate_15 = _$esUtils_4.isoDate;
/*
 * Automatically detects browser device details
 */


var _$device_15 = {
  init: function (client) {
    client.config.beforeSend.unshift(function (report) {
      report.device = ___extends_15({
        time: __isoDate_15(),
        locale: navigator.browserLanguage || navigator.systemLanguage || navigator.userLanguage || navigator.language,
        userAgent: navigator.userAgent
      }, report.device);
    });

    client.beforeSession.push(function (session) {
      session.device = { userAgent: navigator.userAgent };
    });
  }
};

var _$inlineScriptContent_16 = {};
var __dummy_16$0 = 0,
    __reduce_16 = _$esUtils_4.reduce;

_$inlineScriptContent_16 = {
  init: function (client) {
    var html = '';
    var DOMContentLoaded = false;
    var getHtml = function () {
      return document.documentElement.outerHTML;
    };
    var originalLocation = window.location.href;

    var addInlineContent = function (report) {
      var frame = report.stacktrace[0];
      if (!frame || !frame.file || !frame.lineNumber) return frame;
      if (frame.file.replace(/#.*$/, '') !== originalLocation.replace(/#.*$/, '')) return frame;
      if (!DOMContentLoaded || !html) html = getHtml();
      var htmlLines = ['<!-- DOCUMENT START -->'].concat(html.split('\n'));

      var _extractScriptContent = extractScriptContent(htmlLines, frame.lineNumber - 1),
          script = _extractScriptContent.script,
          start = _extractScriptContent.start;

      var code = __reduce_16(script, function (accum, line, i) {
        if (Math.abs(start + i + 1 - frame.lineNumber) > 10) return accum;
        accum['' + (start + i + 1)] = line;
        return accum;
      }, {});
      frame.code = code;
      report.updateMetaData('script', { content: script.join('\n') });
    };

    // get whatever HTML exists at this point in time
    html = getHtml();

    // then update it when the DOM content has loaded
    document.onreadystatechange = function () {
      // IE8 compatible alternative to document#DOMContentLoaded
      if (document.readyState === 'interactive') {
        html = getHtml();
        DOMContentLoaded = true;
      }
    };

    client.config.beforeSend.unshift(addInlineContent);
  }
};

var scriptStartRe = /^.*<script.*?>/;
var scriptEndRe = /<\/script>.*$/;
var extractScriptContent = _$inlineScriptContent_16.extractScriptContent = function (lines, startLine) {
  // search down for </script>
  var line = startLine;
  while (line < lines.length && !scriptEndRe.test(lines[line])) {
    line++;
  } // search up for <script>
  var end = line;
  while (line > 0 && !scriptStartRe.test(lines[line])) {
    line--;
  }var start = line;

  // strip <script> tags so that lines just contain js content
  var script = lines.slice(start, end + 1);
  script[0] = script[0].replace(scriptStartRe, '');
  script[script.length - 1] = script[script.length - 1].replace(scriptEndRe, '');

  // return the array of lines, and the line number the script started at
  return { script: script, start: start };
};

/*
 * Leaves breadcrumbs when the user interacts with the DOM
 */
var _$interactionBreadcrumbs_17 = {
  init: function (client) {
    if (!('addEventListener' in window)) return;

    window.addEventListener('click', function (event) {
      var targetText = void 0,
          targetSelector = void 0;
      try {
        targetText = getNodeText(event.target);
        targetSelector = getNodeSelector(event.target);
      } catch (e) {
        targetText = '[hidden]';
        targetSelector = '[hidden]';
        client._logger.error('Cross domain error when tracking click event. See https://docs.bugsnag.com/platforms/browsers/faq/#3-cross-origin-script-errors');
      }
      client.leaveBreadcrumb('UI click', { targetText: targetText, targetSelector: targetSelector }, 'user');
    }, true);
  },
  configSchema: {
    interactionBreadcrumbsEnabled: {
      defaultValue: function () {
        return undefined;
      },
      validate: function (value) {
        return value === true || value === false || value === undefined;
      },
      message: 'should be true|false'
    }
  }

  // extract text content from a element
};var getNodeText = function (el) {
  var text = el.textContent || el.innerText || '';
  if (!text && (el.type === 'submit' || el.type === 'button')) text = el.value;
  text = text.replace(/^\s+|\s+$/g, ''); // trim whitespace
  return truncate(text, 140);
};

// Create a label from tagname, id and css class of the element
function getNodeSelector(el) {
  var parts = [el.tagName];
  if (el.id) parts.push('#' + el.id);
  if (el.className && el.className.length) parts.push('.' + el.className.split(' ').join('.'));
  // Can't get much more advanced with the current browser
  if (!document.querySelectorAll || !Array.prototype.indexOf) return parts.join('');
  try {
    if (document.querySelectorAll(parts.join('')).length === 1) return parts.join('');
  } catch (e) {
    // Sometimes the query selector can be invalid just return it as-is
    return parts.join('');
  }
  // try to get a more specific selector if this one matches more than one element
  if (el.parentNode.childNodes.length > 1) {
    var index = Array.prototype.indexOf.call(el.parentNode.childNodes, el) + 1;
    parts.push(':nth-child(' + index + ')');
  }
  if (document.querySelectorAll(parts.join('')).length === 1) return parts.join('');
  // try prepending the parent node selector
  if (el.parentNode) return getNodeSelector(el.parentNode) + ' > ' + parts.join('');
  return parts.join('');
}

function truncate(value, length) {
  var ommision = '(...)';
  if (value && value.length <= length) return value;
  return value.slice(0, length - ommision.length) + ommision;
}

var ___extends_18 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/*
 * Prevent collection of user IPs
 */
var _$ip_18 = {
  init: function (client) {
    if (client.config.collectUserIp) return;
    client.config.beforeSend.push(function (report) {
      report.user = ___extends_18({ id: '[NOT COLLECTED]' }, report.user);
      report.request = ___extends_18({ clientIp: '[NOT COLLECTED]' }, report.request);
    });
  }
};

var _$navigationBreadcrumbs_19 = {};
/*
 * Leaves breadcrumbs when navigation methods are called or events are emitted
 */
_$navigationBreadcrumbs_19.init = function (client) {
  if (!('addEventListener' in window)) return;

  // returns a function that will drop a breadcrumb with a given name
  var drop = function (name) {
    return function () {
      return client.leaveBreadcrumb(name, {}, 'navigation');
    };
  };

  // simple drops – just names, no meta
  window.addEventListener('pagehide', drop('Page hidden'), true);
  window.addEventListener('pageshow', drop('Page shown'), true);
  window.addEventListener('load', drop('Page loaded'), true);
  window.document.addEventListener('DOMContentLoaded', drop('DOMContentLoaded'), true);
  // some browsers like to emit popstate when the page loads, so only add the popstate listener after that
  window.addEventListener('load', function () {
    return window.addEventListener('popstate', drop('Navigated back'), true);
  });

  // hashchange has some metaData that we care about
  window.addEventListener('hashchange', function (event) {
    var metaData = event.oldURL ? { from: relativeLocation(event.oldURL), to: relativeLocation(event.newURL), state: getCurrentState() } : { to: relativeLocation(window.location.href) };
    client.leaveBreadcrumb('Hash changed', metaData, 'navigation');
  }, true);

  // the only way to know about replaceState/pushState is to wrap them… >_<

  if (window.history.replaceState) wrapHistoryFn(client, window.history, 'replaceState');
  if (window.history.pushState) wrapHistoryFn(client, window.history, 'pushState');

  client.leaveBreadcrumb('Bugsnag loaded', {}, 'navigation');
};

_$navigationBreadcrumbs_19.configSchema = {
  navigationBreadcrumbsEnabled: {
    defaultValue: function () {
      return undefined;
    },
    validate: function (value) {
      return value === true || value === false || value === undefined;
    },
    message: 'should be true|false'
  }
};

if ("production" !== 'production') {
  _$navigationBreadcrumbs_19.destroy = function () {
    window.history.replaceState._restore();
    window.history.pushState._restore();
  };
}

// takes a full url like http://foo.com:1234/pages/01.html?yes=no#section-2 and returns
// just the path and hash parts, e.g. /pages/01.html?yes=no#section-2
var relativeLocation = function (url) {
  var a = document.createElement('A');
  a.href = url;
  return '' + a.pathname + a.search + a.hash;
};

var stateChangeToMetaData = function (state, title, url) {
  var currentPath = relativeLocation(window.location.href);
  return { title: title, state: state, prevState: getCurrentState(), to: url || currentPath, from: currentPath };
};

var wrapHistoryFn = function (client, target, fn) {
  var orig = target[fn];
  target[fn] = function (state, title, url) {
    client.leaveBreadcrumb('History ' + fn, stateChangeToMetaData(state, title, url), 'navigation');
    // if throttle plugin is in use, refresh the event sent count
    if (typeof client.refresh === 'function') client.refresh();
    // if the client is operating in session-mode, a new route should trigger a new session
    if (client.session) client.startSession();
    // Internet Explorer will convert `undefined` to a string when passed, causing an unintended redirect
    // to '/undefined'. therefore we only pass the url if it's not undefined.
    orig.apply(target, [state, title].concat(url !== undefined ? url : []));
  };
  target[fn]._restore = function () {
    target[fn] = orig;
  };
};

var getCurrentState = function () {
  try {
    return window.history.state;
  } catch (e) {}
};

var _$networkBreadcrumbs_20 = {};
var BREADCRUMB_TYPE = 'request';

// keys to safely store metadata on the request object
var REQUEST_SETUP_KEY = 'BUGSNAG:SETUP';
var REQUEST_URL_KEY = 'BUGSNAG:REQUEST_URL';
var REQUEST_METHOD_KEY = 'BUGSNAG:REQUEST_METHOD';

var restoreFunctions = [];
var client = void 0;

/*
 * Leaves breadcrumbs when network requests occur
 */
_$networkBreadcrumbs_20.init = function (_client) {
  client = _client;
  monkeyPatchXMLHttpRequest();
  monkeyPatchFetch();
};

_$networkBreadcrumbs_20.configSchema = {
  networkBreadcrumbsEnabled: {
    defaultValue: function () {
      return undefined;
    },
    validate: function (value) {
      return value === true || value === false || value === undefined;
    },
    message: 'should be true|false'
  }
};

if ("production" !== 'production') {
  _$networkBreadcrumbs_20.destroy = function () {
    restoreFunctions.forEach(function (fn) {
      return fn();
    });
    restoreFunctions = [];
  };
}

// XMLHttpRequest monkey patch
var monkeyPatchXMLHttpRequest = function () {
  if (!('addEventListener' in window.XMLHttpRequest.prototype)) return;
  var nativeOpen = window.XMLHttpRequest.prototype.open;

  // override native open()
  window.XMLHttpRequest.prototype.open = function open(method, url) {
    // store url and HTTP method for later
    this[REQUEST_URL_KEY] = url;
    this[REQUEST_METHOD_KEY] = method;

    // if we have already setup listeners, it means open() was called twice, we need to remove
    // the listeners and recreate them
    if (this[REQUEST_SETUP_KEY]) {
      this.removeEventListener('load', handleXHRLoad);
      this.removeEventListener('error', handleXHRError);
    }

    // attach load event listener
    this.addEventListener('load', handleXHRLoad);
    // attach error event listener
    this.addEventListener('error', handleXHRError);

    this[REQUEST_SETUP_KEY] = true;

    nativeOpen.apply(this, arguments);
  };

  if ("production" !== 'production') {
    restoreFunctions.push(function () {
      window.XMLHttpRequest.prototype.open = nativeOpen;
    });
  }
};

function handleXHRLoad() {
  if (this[REQUEST_URL_KEY] === client.config.endpoint || this[REQUEST_URL_KEY] === client.config.sessionEndpoint) {
    // don't leave a network breadcrumb from bugsnag notify calls
    return;
  }
  var metaData = {
    status: this.status,
    request: this[REQUEST_METHOD_KEY] + ' ' + this[REQUEST_URL_KEY]
  };
  if (this.status >= 400) {
    // contacted server but got an error response
    client.leaveBreadcrumb('XMLHttpRequest failed', metaData, BREADCRUMB_TYPE);
  } else {
    client.leaveBreadcrumb('XMLHttpRequest succeeded', metaData, BREADCRUMB_TYPE);
  }
}

function handleXHRError() {
  if (this[REQUEST_URL_KEY] === client.config.endpoint || this[REQUEST_URL_KEY] === client.config.sessionEndpoint) {
    // don't leave a network breadcrumb from bugsnag notify calls
    return;
  }
  // failed to contact server
  client.leaveBreadcrumb('XMLHttpRequest error', {
    request: this[REQUEST_METHOD_KEY] + ' ' + this[REQUEST_URL_KEY]
  }, BREADCRUMB_TYPE);
}

// window.fetch monkey patch
var monkeyPatchFetch = function () {
  if (!('fetch' in window)) return;

  var oldFetch = window.fetch;
  window.fetch = function fetch() {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var url = args[0],
        options = args[1];

    var method = 'GET';
    if (options && options.method) {
      method = options.method;
    }
    return new Promise(function (resolve, reject) {
      // pass through to native fetch
      oldFetch.apply(undefined, args).then(function (response) {
        handleFetchSuccess(response, method, url);
        resolve(response);
      })['catch'](function (error) {
        handleFetchError(method, url);
        reject(error);
      });
    });
  };

  if ("production" !== 'production') {
    restoreFunctions.push(function () {
      window.fetch = oldFetch;
    });
  }
};

var handleFetchSuccess = function (response, method, url) {
  var metaData = {
    status: response.status,
    request: method + ' ' + url
  };
  if (response.status >= 400) {
    // when the request comes back with a 4xx or 5xx status it does not reject the fetch promise,
    client.leaveBreadcrumb('fetch() failed', metaData, BREADCRUMB_TYPE);
  } else {
    client.leaveBreadcrumb('fetch() succeeded', metaData, BREADCRUMB_TYPE);
  }
};

var handleFetchError = function (method, url) {
  client.leaveBreadcrumb('fetch() error', { request: method + ' ' + url }, BREADCRUMB_TYPE);
};

var ___extends_21 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/*
 * Sets the report request: { url } to be the current href
 */
var _$request_21 = {
  init: function (client) {
    client.config.beforeSend.unshift(function (report) {
      if (report.request && report.request.url) return;
      report.request = ___extends_21({}, report.request, { url: window.location.href });
    });
  }
};

var ___extends_22 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var __dummy_22$0 = 0,
    __map_22 = _$esUtils_4.map,
    __isArray_22 = _$esUtils_4.isArray,
    __includes_22 = _$esUtils_4.includes;

/* removed: var _$inferReleaseStage_6 = require('../../base/lib/infer-release-stage'); */;

var _$sessions_22 = {
  init: function (client) {
    return client.sessionDelegate(sessionDelegate);
  }
};

var sessionDelegate = {
  startSession: function (client) {
    var sessionClient = client;
    sessionClient.session = new client.BugsnagSession();

    __map_22(sessionClient.beforeSession, function (fn) {
      return fn(sessionClient);
    });

    var releaseStage = _$inferReleaseStage_6(sessionClient);

    // exit early if the reports should not be sent on the current releaseStage
    if (__isArray_22(sessionClient.config.notifyReleaseStages) && !__includes_22(sessionClient.config.notifyReleaseStages, releaseStage)) {
      sessionClient._logger.warn('Session not sent due to releaseStage/notifyReleaseStages configuration');
      return sessionClient;
    }

    sessionClient._transport.sendSession(sessionClient._logger, sessionClient.config, {
      notifier: sessionClient.notifier,
      device: sessionClient.device,
      app: ___extends_22({ releaseStage: releaseStage }, sessionClient.app),
      sessions: [{
        id: sessionClient.session.id,
        startedAt: sessionClient.session.startedAt,
        user: sessionClient.user
      }]
    });

    return sessionClient;
  }
};

var _$stripQueryString_23 = {};
var ___extends_23 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

/*
 * Remove query strings (and fragments) from stacktraces
 */
var __dummy_23$0 = 0,
    __map_23 = _$esUtils_4.map;

_$stripQueryString_23 = {
  init: function (client) {
    client.config.beforeSend.push(function (report) {
      report.stacktrace = __map_23(report.stacktrace, function (frame) {
        return ___extends_23({}, frame, { file: strip(frame.file) });
      });
    });
  }
};

var strip = _$stripQueryString_23._strip = function (str) {
  return typeof str === 'string' ? str.replace(/\?.*$/, '').replace(/#.*$/, '') : str;
};

var _$unhandledRejection_24 = {};
/* removed: var _$errorStackParser_33 = require('error-stack-parser'); */;
/* removed: var _$hasStack_5 = require('../../base/lib/has-stack'); */;

var __dummy_24$0 = 0,
    __reduce_24 = _$esUtils_4.reduce;

/* removed: var _$isError_34 = require('iserror'); */;

/*
 * Automatically notifies Bugsnag when window.onunhandledrejection is called
 */
var _listener = void 0;
_$unhandledRejection_24.init = function (client) {
  var listener = function (event) {
    var error = event.reason;
    var isBluebird = false;

    if (event.detail && event.detail.reason) {
      error = event.detail.reason;
      isBluebird = true;
    }

    var handledState = {
      severity: 'error',
      unhandled: true,
      severityReason: { type: 'unhandledPromiseRejection' }
    };

    var report = void 0;
    if (error && _$hasStack_5(error)) {
      // if it quacks like an Error…
      report = new client.BugsnagReport(error.name, error.message, _$errorStackParser_33.parse(error), handledState);
      if (isBluebird) {
        report.stacktrace = __reduce_24(report.stacktrace, fixBluebirdStacktrace(error), []);
      }
    } else {
      // if it doesn't…
      var msg = 'Rejection reason was not an Error. See "Promise" tab for more detail.';
      report = new client.BugsnagReport(error && error.name ? error.name : 'UnhandledRejection', error && error.message ? error.message : msg, [], handledState);
      // stuff the rejection reason into metaData, it could be useful
      report.updateMetaData('promise', 'rejection reason', serializableReason(error));
    }

    client.notify(report);
  };
  if ('addEventListener' in window) {
    window.addEventListener('unhandledrejection', listener);
  } else {
    window.onunhandledrejection = function (reason, promise) {
      listener({ detail: { reason: reason, promise: promise } });
    };
  }
  _listener = listener;
};

if ("production" !== 'production') {
  _$unhandledRejection_24.destroy = function () {
    if (_listener) {
      if ('addEventListener' in window) {
        window.removeEventListener('unhandledrejection', _listener);
      } else {
        window.onunhandledrejection = null;
      }
    }
    _listener = null;
  };
}

var serializableReason = function (err) {
  if (err === null || err === undefined) {
    return 'undefined (or null)';
  } else if (_$isError_34(err)) {
    var _ref;

    return _ref = {}, _ref[Object.prototype.toString.call(err)] = {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: err.stack
    }, _ref;
  } else {
    return err;
  }
};

// The stack parser on bluebird stacks in FF get a suprious first frame:
//
// Error: derp
//   b@http://localhost:5000/bluebird.html:22:24
//   a@http://localhost:5000/bluebird.html:18:9
//   @http://localhost:5000/bluebird.html:14:9
//
// results in
//   […]
//     0: Object { file: "Error: derp", method: undefined, lineNumber: undefined, … }
//     1: Object { file: "http://localhost:5000/bluebird.html", method: "b", lineNumber: 22, … }
//     2: Object { file: "http://localhost:5000/bluebird.html", method: "a", lineNumber: 18, … }
//     3: Object { file: "http://localhost:5000/bluebird.html", lineNumber: 14, columnNumber: 9, … }
//
// so the following reduce/accumulator function removes such frames
//
// Bluebird pads method names with spaces so trim that too…
// https://github.com/petkaantonov/bluebird/blob/b7f21399816d02f979fe434585334ce901dcaf44/src/debuggability.js#L568-L571
var fixBluebirdStacktrace = function (error) {
  return function (accum, frame) {
    if (frame.file === error.toString()) return accum;
    if (frame.method) {
      frame.method = frame.method.replace(/^\s+/, '');
    }
    return accum.concat(frame);
  };
};

/*
 * Automatically notifies Bugsnag when window.onerror is called
 */

var _$windowOnerror_25 = {
  init: function (client) {
    var onerror = function (messageOrEvent, url, lineNo, charNo, error) {
      // Ignore errors with no info due to CORS settings
      if (lineNo === 0 && /Script error\.?/.test(messageOrEvent)) {
        client._logger.warn('Ignoring cross-domain or eval script error. See https://docs.bugsnag.com/platforms/browsers/faq/#3-cross-origin-script-errors');
        return;
      }

      // any error sent to window.onerror is unhandled and has severity=error
      var handledState = { severity: 'error', unhandled: true, severityReason: { type: 'unhandledException' } };

      var report = void 0;
      if (error) {
        if (error.name && error.message) {
          report = new client.BugsnagReport(error.name, error.message, decorateStack(client.BugsnagReport.getStacktrace(error), url, lineNo, charNo), handledState);
        } else {
          report = new client.BugsnagReport('window.onerror', String(error), decorateStack(client.BugsnagReport.getStacktrace(error, 1), url, lineNo, charNo), handledState);
          report.updateMetaData('window onerror', { error: error });
        }
      } else if (typeof messageOrEvent === 'object' && messageOrEvent !== null && !url && !lineNo && !charNo && !error) {
        var name = messageOrEvent.type ? 'Event: ' + messageOrEvent.type : 'window.onerror';
        var message = messageOrEvent.message || messageOrEvent.detail || '';
        report = new client.BugsnagReport(name, message, client.BugsnagReport.getStacktrace(new Error(), 1).slice(1), handledState);
        report.updateMetaData('window onerror', { event: messageOrEvent });
      } else {
        report = new client.BugsnagReport('window.onerror', String(messageOrEvent), decorateStack(client.BugsnagReport.getStacktrace(error, 1), url, lineNo, charNo), handledState);
        report.updateMetaData('window onerror', { event: messageOrEvent });
      }

      client.notify(report);

      if (typeof prevOnError === 'function') prevOnError(messageOrEvent, url, lineNo, charNo, error);
    };

    var prevOnError = window.onerror;
    window.onerror = onerror;
  }
};

var decorateStack = function (stack, url, lineNo, charNo) {
  var culprit = stack[0];
  if (!culprit) return stack;
  if (!culprit.fileName) culprit.setFileName(url);
  if (!culprit.lineNumber) culprit.setLineNumber(lineNo);
  if (!culprit.columnNumber) {
    if (charNo !== undefined) {
      culprit.setColumnNumber(charNo);
    } else if (window.event && window.event.errorCharacter) {
      culprit.setColumnNumber(window.event && window.event.errorCharacter);
    }
  }
  return stack;
};

var _$safeJsonStringify_32 = function (data, replacer, space) {
  return JSON.stringify(ensureProperties(data), replacer, space);
};

var MAX_DEPTH = 20;
var MAX_EDGES = 25000;
var MIN_PRESERVED_DEPTH = 8;

var REPLACEMENT_NODE = '...';

function throwsMessage(err) {
  return '[Throws: ' + (err ? err.message : '?') + ']';
}

function find(haystack, needle) {
  for (var i = 0, len = haystack.length; i < len; i++) {
    if (haystack[i] === needle) return true;
  }
  return false;
}

function __isArray_32(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}

function safelyGetProp(obj, prop) {
  try {
    return obj[prop];
  } catch (err) {
    return throwsMessage(err);
  }
}

function ensureProperties(obj) {
  var seen = []; // store references to objects we have seen before
  var edges = 0;

  function visit(obj, depth) {
    function edgesExceeded() {
      return depth > MIN_PRESERVED_DEPTH && edges > MAX_EDGES;
    }

    edges++;

    if (depth === undefined) depth = 0;
    if (depth > MAX_DEPTH) return REPLACEMENT_NODE;
    if (edgesExceeded()) return REPLACEMENT_NODE;
    if (obj === null || typeof obj !== 'object') return obj;
    if (find(seen, obj)) return '[Circular]';

    seen.push(obj);

    if (typeof obj.toJSON === 'function') {
      try {
        // we're not going to count this as an edge because it
        // replaces the value of the currently visited object
        edges--;
        var fResult = visit(obj.toJSON(), depth);
        seen.pop();
        return fResult;
      } catch (err) {
        return throwsMessage(err);
      }
    }

    if (__isArray_32(obj)) {
      var aResult = [];
      for (var i = 0, len = obj.length; i < len; i++) {
        if (edgesExceeded()) {
          aResult.push(REPLACEMENT_NODE);
          break;
        }
        aResult.push(visit(obj[i], depth + 1));
      }
      seen.pop();
      return aResult;
    }

    var result = {};
    try {
      for (var prop in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, prop)) continue;
        if (edgesExceeded()) {
          result[prop] = REPLACEMENT_NODE;
          break;
        }
        result[prop] = visit(safelyGetProp(obj, prop), depth + 1);
      }
    } catch (e) {}
    seen.pop();
    return result;
  }

  return visit(obj);
}

/* removed: var _$safeJsonStringify_32 = require('@bugsnag/safe-json-stringify'); */;

var _$payload_26 = function (report) {
  var payload = _$safeJsonStringify_32(report);
  if (payload.length > 10e5) {
    delete report.events[0].metaData;
    report.events[0].metaData = {
      notifier: 'WARNING!\nThe serialized payload was ' + payload.length / 10e5 + 'MB. The limit is 1MB.\nreport.metaData was stripped to make the payload of a deliverable size.'
    };
    payload = _$safeJsonStringify_32(report);
    if (payload.length > 10e5) throw new Error('payload exceeded 1MB limit');
  }
  return payload;
};

var _$xDomainRequest_27 = {};
/* removed: var _$payload_26 = require('./lib/payload'); */;
/* removed: var _$safeJsonStringify_32 = require('@bugsnag/safe-json-stringify'); */;

var __dummy_27$0 = 0,
    __isoDate_27 = _$esUtils_4.isoDate;

_$xDomainRequest_27 = {
  name: 'XDomainRequest',
  sendReport: function (logger, config, report) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function () {};

    var url = matchPageProtocol(config.endpoint, window.location.protocol) + '?apiKey=' + encodeURIComponent(config.apiKey) + '&payloadVersion=4.0&sentAt=' + encodeURIComponent(__isoDate_27());
    var req = new window.XDomainRequest();
    req.onload = function () {
      cb(null, req.responseText);
    };
    req.open('POST', url);
    setTimeout(function () {
      try {
        req.send(_$payload_26(report));
      } catch (e) {
        logger.error(e);
      }
    }, 0);
  },
  sendSession: function (logger, config, session) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function () {};

    var url = matchPageProtocol(config.sessionEndpoint, window.location.protocol) + '?apiKey=' + encodeURIComponent(config.apiKey) + '&payloadVersion=1.0&sentAt=' + encodeURIComponent(__isoDate_27());
    var req = new window.XDomainRequest();
    req.onload = function () {
      cb(null, req.responseText);
    };
    req.open('POST', url);
    setTimeout(function () {
      try {
        req.send(_$safeJsonStringify_32(session));
      } catch (e) {
        logger.error(e);
      }
    }, 0);
  }
};

var matchPageProtocol = _$xDomainRequest_27._matchPageProtocol = function (endpoint, pageProtocol) {
  return pageProtocol === 'http:' ? endpoint.replace(/^https:/, 'http:') : endpoint;
};

/* removed: var _$payload_26 = require('./lib/payload'); */;
/* removed: var _$safeJsonStringify_32 = require('@bugsnag/safe-json-stringify'); */;

var __dummy_28$0 = 0,
    __isoDate_28 = _$esUtils_4.isoDate;

var _$xmlHttpRequest_28 = {
  name: 'XMLHttpRequest',
  sendReport: function (logger, config, report) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function () {};

    var url = config.endpoint;
    var req = new window.XMLHttpRequest();
    req.onreadystatechange = function () {
      if (req.readyState === window.XMLHttpRequest.DONE) cb(null, req.responseText);
    };
    req.open('POST', url);
    req.setRequestHeader('Content-Type', 'application/json');
    req.setRequestHeader('Bugsnag-Api-Key', report.apiKey || config.apiKey);
    req.setRequestHeader('Bugsnag-Payload-Version', '4.0');
    req.setRequestHeader('Bugsnag-Sent-At', __isoDate_28());
    try {
      req.send(_$payload_26(report));
    } catch (e) {
      logger.error(e);
    }
  },
  sendSession: function (logger, config, session) {
    var cb = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : function () {};

    var url = config.sessionEndpoint;
    var req = new window.XMLHttpRequest();
    req.onreadystatechange = function () {
      if (req.readyState === window.XMLHttpRequest.DONE) cb(null, req.responseText);
    };
    req.open('POST', url);
    req.setRequestHeader('Content-Type', 'application/json');
    req.setRequestHeader('Bugsnag-Api-Key', config.apiKey);
    req.setRequestHeader('Bugsnag-Payload-Version', '1.0');
    req.setRequestHeader('Bugsnag-Sent-At', __isoDate_28());
    try {
      req.send(_$safeJsonStringify_32(session));
    } catch (e) {
      logger.error(e);
    }
  }
};

var _$browser_12 = {};
var ___extends_12 = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var name = 'Bugsnag JavaScript';
var version = '4.6.3';
var url = 'https://github.com/bugsnag/bugsnag-js';

/* removed: var _$BugsnagClient_2 = require('../base/client'); */;
/* removed: var _$BugsnagReport_9 = require('../base/report'); */;
/* removed: var _$Session_10 = require('../base/session'); */;
/* removed: var _$BugsnagBreadcrumb_1 = require('../base/breadcrumb'); */;

var __dummy_12$0 = 0,
    __map_12 = _$esUtils_4.map,
    __reduce_12 = _$esUtils_4.reduce;

// extend the base config schema with some browser-specific options


var __schema_12 = ___extends_12({}, _$config_3.schema, _$config_11);

/* removed: var _$windowOnerror_25 = require('./plugins/window-onerror'); */;
/* removed: var _$unhandledRejection_24 = require('./plugins/unhandled-rejection'); */;
/* removed: var _$device_15 = require('./plugins/device'); */;
/* removed: var _$context_14 = require('./plugins/context'); */;
/* removed: var _$request_21 = require('./plugins/request'); */;
/* removed: var _$throttle_8 = require('../base/plugins/throttle'); */;
/* removed: var _$consoleBreadcrumbs_13 = require('./plugins/console-breadcrumbs'); */;
/* removed: var _$networkBreadcrumbs_20 = require('./plugins/network-breadcrumbs'); */;
/* removed: var _$navigationBreadcrumbs_19 = require('./plugins/navigation-breadcrumbs'); */;
/* removed: var _$interactionBreadcrumbs_17 = require('./plugins/interaction-breadcrumbs'); */;
/* removed: var _$inlineScriptContent_16 = require('./plugins/inline-script-content'); */;
/* removed: var _$sessions_22 = require('./plugins/sessions'); */;
/* removed: var _$ip_18 = require('./plugins/ip'); */;
/* removed: var _$stripQueryString_23 = require('./plugins/strip-query-string'); */;

var plugins = [_$windowOnerror_25, _$unhandledRejection_24, _$device_15, _$context_14, _$request_21, _$throttle_8, _$consoleBreadcrumbs_13, _$networkBreadcrumbs_20, _$navigationBreadcrumbs_19, _$interactionBreadcrumbs_17, _$inlineScriptContent_16, _$sessions_22, _$ip_18, _$stripQueryString_23];

var transports = {
  'XDomainRequest': _$xDomainRequest_27,
  'XMLHttpRequest': _$xmlHttpRequest_28
};

_$browser_12 = function (opts) {
  var userPlugins = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

  // handle very simple use case where user supplies just the api key as a string
  if (typeof opts === 'string') opts = { apiKey: opts

    // support renamed option
  };if (opts.sessionTrackingEnabled) {
    opts.autoCaptureSessions = opts.sessionTrackingEnabled;
  }

  // allow plugins to augment the schema with their own options
  var finalSchema = __reduce_12([].concat(plugins).concat(userPlugins), function (accum, plugin) {
    if (!plugin.configSchema) return accum;
    return ___extends_12({}, accum, plugin.configSchema);
  }, __schema_12);

  var bugsnag = new _$BugsnagClient_2({ name: name, version: version, url: url }, finalSchema);

  // set transport based on browser capability (IE 8+9 have an XDomainRequest object)
  bugsnag.transport(window.XDomainRequest ? transports.XDomainRequest : transports.XMLHttpRequest);

  try {
    // configure with user supplied options
    // errors can be thrown here that prevent the lib from being in a useable state
    bugsnag.configure(opts);
  } catch (e) {
    bugsnag._logger.warn(e);
    if (e.errors) __map_12(e.errors, bugsnag._logger.warn);
    // rethrow. if there was an error with configuration
    // the library is not going to work
    throw e;
  }

  // always-on browser-specific plugins
  bugsnag.use(_$device_15);
  bugsnag.use(_$context_14);
  bugsnag.use(_$request_21);
  bugsnag.use(_$inlineScriptContent_16);
  bugsnag.use(_$throttle_8);
  bugsnag.use(_$sessions_22);
  bugsnag.use(_$ip_18);
  bugsnag.use(_$stripQueryString_23);

  // optional browser-specific plugins

  if (bugsnag.config.autoNotify !== false) {
    bugsnag.use(_$windowOnerror_25);
    bugsnag.use(_$unhandledRejection_24);
  }

  if (inferBreadcrumbSetting(bugsnag.config, 'navigationBreadcrumbsEnabled')) {
    bugsnag.use(_$navigationBreadcrumbs_19);
  }

  if (inferBreadcrumbSetting(bugsnag.config, 'interactionBreadcrumbsEnabled')) {
    bugsnag.use(_$interactionBreadcrumbs_17);
  }

  if (inferBreadcrumbSetting(bugsnag.config, 'networkBreadcrumbsEnabled')) {
    bugsnag.use(_$networkBreadcrumbs_20);
  }

  // because console breadcrumbs play havoc with line numbers,
  // if not explicitly enabled, only setup on non-development evironments
  if (inferBreadcrumbSetting(bugsnag.config, 'consoleBreadcrumbsEnabled', false)) {
    bugsnag.use(_$consoleBreadcrumbs_13);
  }

  // init user supplied plugins
  __map_12(userPlugins, function (plugin) {
    return bugsnag.use(plugin);
  });

  return bugsnag.config.autoCaptureSessions ? bugsnag.startSession() : bugsnag;
};

var inferBreadcrumbSetting = function (config, val) {
  var defaultInDev = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
  return typeof config[val] === 'boolean' ? config[val] : config.autoBreadcrumbs && (defaultInDev || !/^dev(elopment)?$/.test(config.releaseStage));
};

// Stub this value because this is what the type interface looks like
// (types/bugsnag.d.ts). This is only an issue in Angular's development
// mode as its TS/DI thingy attempts to use this value at runtime.
// In most other situations, TS only uses the types at compile time.
_$browser_12.Bugsnag = {
  Client: _$BugsnagClient_2,
  Report: _$BugsnagReport_9,
  Session: _$Session_10,
  Breadcrumb: _$BugsnagBreadcrumb_1

  // Export a "default" property for compatibility with ESM imports
};_$browser_12['default'] = _$browser_12;

return _$browser_12;

});