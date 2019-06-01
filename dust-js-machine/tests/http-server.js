const {DustMachine} = require('../src');
const process = require('process');

const machine = new DustMachine;
machine.runMain(async () => {

  const httpServer = await machine.launchEngine('http-server', {
    Interface: {
      Tcp: {
        Host: '0.0.0.0',
        Port: 9238,
      },
    },
    RootHandler: {
      InnerRules: [{
        Conditions: [{
          PathPatterns: ['/healthz'],
        }],
        ForwardTo: {
          DefaultAction: {
            FixedResponse: {
              StatusCode: 200,
              Body: {
                StringData: 'ok',
              },
              Headers: [{
                Key: 'Content-Type',
                Value: 'text/plain',
              }],
            },
          },
        },
      }/*,{
        Conditions: [{
          Host: {
            Names: [
              'localhost', '127.0.0.1',
            ],
          },
        }],
        ForwardTo: {
          DefaultAction: {
            FixedResponse: {
              StatusCode: 200,
              Body: {
                StringData: 'Hello, World!',
              },
              Headers: [{
                Key: 'Content-Type',
                Value: 'text/plain',
              }],
            },
          },
        },
      }*/],
      DefaultAction: {
        FixedResponse: {
          StatusCode: 421,
          Body: {
            StringData: '421 Misdirected Request',
          },
          Headers: [{
            Key: 'Content-Type',
            Value: 'text/plain',
          }],
        },
      },
    },
  });

  console.log('have http-server', httpServer);

});
