const {DustMachine} = require('@dustjs/machine');

const machine = new DustMachine;
machine.runMain(async () => {


  // const {promisify} = require('util');
  // const setTimeoutAsync = promisify(setTimeout);
  // await setTimeoutAsync(10000);

  const firestore = await machine.launchBackend('firestore', {
    Authentication: { ServiceAccount: {
      ProjectId: 'stardust-156404',
      KeyFilename: 'firestore-credential.json',
    }},
    RootDocPath: 'dust/'+require('os').hostname(),
  });

  const dustDomain = await machine.launchEngine('dust-domain', {
    DomainName: 'localhost',
    AccessPolicy: 'public',
  });

  const dustManager = await machine.launchEngine('dust-manager', {
    Sources: [{
      Label: 'Public Market',
      Location: { S3Bucket: {
        BucketOrigin: 'https://stardust-repo.s3.amazonaws.com',
        ObjectPrefix: 'packages/',
      }},
    }],
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

  const webroots = await machine.launchEngine('host-filesystem', {
    Anchor: {
      HostPath: require('path').join(process.cwd(), 'webroots'),
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
              Ref: dustManager,
              Behavior: 'serveAppReq',
              Input: {
                PathDepth: 1,
              },
            }},
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
            RootDir: await webroots.Root.getDirectory('default-site'),
          },
        },
      },
    });


  console.log('have http-server', httpServer.Status, httpServer.Interface);

  console.log('sending test request...');
  const stdout = await ExecForLine({
    command: `curl -sv http://127.0.0.1:9238/`,
  });
  console.log();
  console.log('>', stdout.split('\n').join('\n> '));

});
