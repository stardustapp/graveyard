GraphEngine.attachBehavior('http-messages/v1-beta1', 'Request', {

  /*
  TODO: getters?
    RemoteAddress: req.connection.remoteAddress, // TODO: X-Forwarded-For
    HostName: hostname || ipv4 || ipv6,
    AltPort: altPort.length ? parseInt(altPort) : null,
    Origin: `http://${hostname || ipv4 || ipv6}${altPort.length ? ':' : ''}${altPort}`,
  */

  getHeader(header) {
    const key = header.toLowerCase();
    return this.Headers.find(x => x
      .Key.toLowerCase() === key);
  },

  assertNormalRequest() {
    if (request.Body.currentKey === 'HttpUpgrade')
      throw new HttpBodyThrowable(400,
        `Upgrade Not Allowed`);
  },

  hasTrailingSlash() {
    return this.Path[this.Path.length - 1] === '/'
  },
  isConditionalGET() {
    return this.getHeader('if-match') ||
      this.getHeader('if-unmodified-since') ||
      this.getHeader('if-none-match') ||
      this.getHeader('if-modified-since');
  },
  /*
  isPreconditionFailure () {
    var req = this.req
    var res = this.res

    // if-match
    var match = req.headers['if-match']
    if (match) {
      var etag = res.getHeader('ETag')
      return !etag || (match !== '*' && parseTokenList(match).every(function (match) {
        return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag
      }))
    }

    // if-unmodified-since
    var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since'])
    if (!isNaN(unmodifiedSince)) {
      var lastModified = parseHttpDate(res.getHeader('Last-Modified'))
      return isNaN(lastModified) || lastModified > unmodifiedSince
    }

    return false
  },
  */

  async makeNodeJsStreamingResponse(stream, statusCode=200) {
    const resp = await this.RETURNED.newResponse({
      Timestamp: new Date,
      Status: { Code: statusCode },
      Body: { NativeStream: true },
    });
    resp.nodeJsStream = stream;
    //console.log('stream in', resp);
    return resp;
  },

  makeStringResponse(contentType, StringData, statusCode=200) {
    return this.RETURNED.newResponse({
      Timestamp: new Date,
      Status: { Code: statusCode },
      Headers: [{
        Key: 'Content-Type',
        Value: contentType,
      }],
      Body: { StringData },
    });
  },

  makeJsonResponse(data, statusCode=200) {
    return this.makeStringResponse('application/json', JSON.stringify(data, null, 2), statusCode);
  },
  makeHtmlResponse(data, statusCode=200) {
    return this.makeStringResponse('text/html', data, statusCode);
  },
  makePlaintextResponse(data, statusCode=200) {
    return this.makeStringResponse('text/plain', data, statusCode);
  },

  async makeNotModifiedResponse() {
    const resp = await this.makeStringResponse('text/html', '', 304);
    resp.removeContentHeaderFields();
    return resp;
  },

  async makeRedirect(target, statusCode=303) {
    const resp = await this.makeHtmlResponse(commonTags.safeHtml`
      <!doctype html>
      <title>Redirecting...</title>
      <p>You are being redirected to <a href="${target}">${target}</a>.</p>
    `, statusCode);
    resp.setHeader('Location', target);
    return resp;
  },

  makeSlashRedirectThrowable() {
    let newUrl = this.Path + '/';
    //if (req.uri.includes('?'))
    //  newUrl += '?' + queryStr;
    return new HttpBodyThrowable(303, commonTags.safeHtml`
      <!doctype html>
      <title>Redirecting...</title>
      <p>You are being redirected to <a href="${newUrl}">${newUrl}</a>.</p>
    `, {
      Location: newUrl,
    });
  },

  // for browsers
  makeBlobResponse(blob, statusCode=200) {
    // For text files, assume UTF-8
    let type = blob.Mime || 'application/octet-stream';
    if (type.startsWith('text/') && !type.includes('charset=')) {
      type += '; charset=utf-8';
    }
    // TODO: some sort of prefab for this
    return this.RETURNED.newResponse({
      Timestamp: new Date,
      Status: { Code: statusCode },
      Headers: [{
        Key: 'Content-Type',
        Value: type,
      }],
      Body: { Base64: blob.Data },
    });
  },

  async makeWebSocketResponse(callback) {
    const response = await this.RETURNED.newResponse({
      Timestamp: new Date,
      Status: { Code: 101 },
      Body: { WebSocket: {
        ReadyState: 0,
      }},
    });
    response.Body.WebSocket.attachCallback(callback);
    return response;
  },

});
