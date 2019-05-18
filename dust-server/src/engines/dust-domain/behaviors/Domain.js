GraphEngine.attachBehavior('dust-domain/v1-beta1', 'Domain', {

  async serveHttpRequest(graphWorld, request) {

    //throw new Error(`TODO ${request.Path}`);

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
