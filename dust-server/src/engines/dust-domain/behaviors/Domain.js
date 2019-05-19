GraphEngine.attachBehavior('dust-domain/v1-beta1', 'Domain', {

  async serveHttpRequest(graphWorld, request) {
    if (request.Body.currentKey === 'HttpUpgrade') {
      if (request.Path !== '/~~export/ws') throw new Error(`bad ws path ${request.Path}`);
      return await request.makeWebSocketResponse(webSocket => {
        console.log('upgraded websocket for', request.Path);
        // TODO: more dusty wrapper around this
        webSocket.on('message', data => {
          console.log('ws message', data);
        });
      });
    }

    if (request.Path === '/~/app-session') {
      if (request.Method !== 'POST') throw new HttpBodyThrowable(405, 'POST-only endpoint');
      return request.makeJsonResponse({
        metadata: {
          chartName: 'dust',
          homeDomain: this.DomainName,
          ownerName: 'dust demo',
          ownerEmail: 'dust@example.com',
        },
        sessionPath: '/pub/sessions/' + randomString() + '/mnt',
      });
    }

    return request.makePlaintextResponse("not found", 404)
  },

});
