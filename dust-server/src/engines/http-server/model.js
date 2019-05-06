setTimeout(() => {
  console.log('stopping');
  require('process').exit();
}, 10000);

new GraphEngineBuilder('http-server/v1-beta1', build => {
  //build.needsEngine('app-profile/v1-beta1');

  build.node('Server', {
    relations: [
      { kind: 'top' },
    ],
    fields: {
      ActiveListeners: { reference: 'Listener', isList: true },
      DefaultHandler: { reference: 'Handler' },
    },
  });

  build.node('Listener', {
    relations: [
      { subject: 'Server', predicate: 'REFERENCES' },
    ],
    fields: {
      //DefaultDomain: String,
      Handler: { reference: 'Handler' },
      Interface: { anyOfKeyed: {
        Unix: { fields: {
          Path: String,
        }},
        Tcp: { fields: {
          Interface: { type: String, optional: true },
          Host: { type: String, defaultValue: '127.0.0.1' },
          Port: { type: Number, optional: true },
        }},
      }},
      TrustProxyLevels: { type: Number, defaultValue: 1 },
      Status: { fields: {
        State: String,
        Message: String,
        LastChange: Date,
        Heartbeat: Date,
      }, optional: true },
    },
  });

  build.node('Handler', {
    relations: [
      { subject: 'Server', predicate: 'REFERENCES' },
      { subject: 'Listener', predicate: 'REFERENCES' },
    ],
    fields: {
      InnerRules: { fields: {
        Conditions: { anyOfKeyed: {
          Host: { fields: {
            Name: { type: String, isList: true },
            AltPort: { type: Number, optional: true },
          }},
          Method: { type: String, isList: true },
          MatchPathPattern: String,
          StripPathPrefix: String,
          HttpHeader: { fields: {
            Key: String,
            Values: { type: String, isList: true },
          }},
          QueryString: { fields: {
            Key: String,
            Values: { type: String, isList: true },
          }},
          SourceIps: { type: String, isList: true },
        }, isList: true },
        ForwardTo: { reference: 'Handler' },
      }, isList: true },

      DefaultAction: { anyOfKeyed: {
        Reference: { reference: true },
        FixedResponse: { fields: {
          StatusCode: Number,
          Body: { anyOfKeyed: {
            StringData: String,
            Base64: String,
          }, optional: true },
          Headers: { fields: {
            Key: String,
            Value: { type: String },
          }, isList: true },
        }}
      }},
    },
  });

}).install();
