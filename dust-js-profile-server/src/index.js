const {DustMachine} = require('@dustjs/machine');

const machine = new DustMachine;
machine.runMain(async () => {


  // const {promisify} = require('util');
  // const setTimeoutAsync = promisify(setTimeout);
  // await setTimeoutAsync(10000);

  const dustDomain = await machine.launchEngine('dust-domain', {
    DomainName: 'localhost',
    AccessPolicy: 'public',
  });

  const httpServer = await machine.launchEngine('http-server', {
    Interface: { Tcp: {
      Host: '0.0.0.0',
      Port: 9238,
    }},
    TrustProxyLevels: 0,
    Metrics: {
      //GlobalTags: ['engine:http-server'],
      MetricPrefix: 'dust.http-server.',
      Sink: { PostProxy: {
        Endpoint: 'https://ingest.devmode.cloud/metrics',
      }},
    },
    RootHandler: {
      InnerRules: [{
        Conditions: [{
          PathPatterns: ['/healthz'],
        }],
        ForwardTo: {
          DefaultAction: { FixedResponse: {
            StatusCode: 200,
            Body: {
              StringData: 'ok',
            },
            Headers: [{
              Key: 'Content-Type',
              Value: 'text/plain',
            }],
          }},
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
      DefaultAction: { FixedResponse: {
        StatusCode: 421,
        Body: {
          StringData: '421 Misdirected Request',
        },
        Headers: [{
          Key: 'Content-Type',
          Value: 'text/plain',
        }],
      }},
    },
  });

  const hostFs = await machine.launchEngine('host-filesystem', {
    Anchor: {
      HostPath: process.cwd(),
    },
    AllowWrites: false,
  });

  const domainName = 'localhost';
  const domainHandler = await httpServer
    .RootHandler.InnerRules.push({
      Conditions: [{
        Host: { Names: [
          'localhost', '127.0.0.1',
          domainName,
          `*.${domainName}`,
        ]},
      }],
      ForwardTo: {
        InnerRules: [{
          Conditions: [{
            PathPatterns: ['/dust-app/*'],
          }],
          ForwardTo: {
            DefaultAction: { ForeignNode: {
              Ref: dustDomain,
              Behavior: 'serveAppReq',
              Input: {
                PathDepth: 1,
              },
            }},
          },
        },{
          Conditions: [{
            PathPatterns: ['/~~src/*'],
          }],
          ForwardTo: {
            DefaultAction: {
              StreamFiles: {
                PathDepth: 1,
                RootDir: await hostFs.Root.getDirectory('src'),
                DotFiles: 'deny',
              },
            },
          },
        },{
          Conditions: [{
            PathPatterns: ['/~/*', '/~~export/*'],
          }],
          ForwardTo: {
            DefaultAction: {
              ForeignNode: {
                Ref: dustDomain,
                Behavior: 'serveHttpRequest',
                AllowUpgrades: ['websocket'],
              },
            },
          },
        }],
        DefaultAction: {
          StreamFiles: {
            PathDepth: 0,
            RootDir: await hostFs.Root.getDirectory('default-www'),
          },
        },
      },
    });


  console.log('have http-server', httpServer.Status, httpServer.Interface);

  console.log('sending test request...');
  const stdout = await ExecForLine({
    command: `curl -sv http://127.0.0.1:9238${'/~~src/'}`,
  });
  console.log();
  console.log('>', stdout.split('\n').join('\n> '));

});
