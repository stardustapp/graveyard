const extensions = GraphEngine.extend('http-server/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, opts) {
    const world = await graphCtx.migrateTopNode(async prevInstance => {
      if (prevInstance) {
        console.log('migrating from previous web server top', prevInstance, 'with opts', opts);
        // TODO: inspect for engine compatibility?

      } else {
        console.log('creating new web server with opts', opts);
        const server = await graphCtx.newTopNode({
          DefaultHandler: {
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
            },{
              Conditions: [{
                Host: {
                  Names: ['localhost', '127.0.0.1'],
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
            }],
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

        await server.ActiveListeners.push({
          Handler: server.DefaultHandler,
          Interface: {
            Tcp: {
              Host: '0.0.0.0',
              Port: 9238,
            },
          },
        });
/*
        server.InspectRoot.HAS_NAME.newEntry({
          Name: 'all graphs',
          Self: { Directory: true },
        });
        server.InspectRoot.HAS_NAME.newEntry({
          Name: 'all engines',
          Self: { Directory: true },
        });
        */
      }
    });
    return world;
  },

};
