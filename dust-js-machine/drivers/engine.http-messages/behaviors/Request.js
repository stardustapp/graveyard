CURRENT_LOADER.attachBehavior(class Request {

  /*
  TODO: getters?
    RemoteAddress: req.connection.remoteAddress, // TODO: X-Forwarded-For
    HostName: hostname || ipv4 || ipv6,
    AltPort: altPort.length ? parseInt(altPort) : null,
    Origin: `http://${hostname || ipv4 || ipv6}${altPort.length ? ':' : ''}${altPort}`,
  */

  getHeaders(header) {
    // TODO: what about repeated headers?
    const key = header.toLowerCase();
    return this.Headers
      .filter(x => x
        .Key.toLowerCase() === key)
      .map(x => x.Value);
  }

  assertNormalRequest() {
    if (this.Body.currentKey === 'HttpUpgrade')
      throw new HttpBodyThrowable(400,
        `Upgrade Not Allowed`);
  }

  // Also Accept-Encoding, Accept-Language
  parseAcceptHeader(key='Accept') {
    const header = this.getHeaders(key)[0];
    if (!header) return [];
    return new AcceptSet(key.toLowerCase(), header.split(',').map(token => {
      const parts = token.trim().split(';');
      if (parts.length < 2) return [parts[0], {}];
      const opts = Object.create(null);
      for (const part of parts.slice(1)) {
        const [key, ...val] = part.split('=');
        opts[key] = val.join('=');
      }
      return [parts[0].toLowerCase(), opts];
    }));
  }

  hasTrailingSlash() {
    return this.Path[this.Path.length - 1] === '/'
  }
  isConditionalGET() {
    return this.getHeaders('if-match').length > 0 ||
      this.getHeaders('if-unmodified-since').length > 0 ||
      this.getHeaders('if-none-match').length > 0 ||
      this.getHeaders('if-modified-since').length > 0;
  }
  /*
  isPreconditionFailure () {
    var req = this.req
    var res = this.res

    // if-match
    var match = req.headers['if-match']
    if (match) {
      var etag = res.getHeaders('ETag')[0]
      return !etag || (match !== '*' && parseTokenList(match).every(function (match) {
        return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag
      }))
    }

    // if-unmodified-since
    var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since'])
    if (!isNaN(unmodifiedSince)) {
      var lastModified = parseHttpDate(res.getHeaders('Last-Modified')[0])
      return isNaN(lastModified) || lastModified > unmodifiedSince
    }

    return false
  }
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
  }

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
  }

  makeJsonResponse(data, statusCode=200) {
    return this.makeStringResponse('application/json', JSON.stringify(data, null, 2), statusCode);
  }
  makeHtmlResponse(data, statusCode=200) {
    return this.makeStringResponse('text/html', data, statusCode);
  }
  makePlaintextResponse(data, statusCode=200) {
    return this.makeStringResponse('text/plain', data, statusCode);
  }

  async makeNotModifiedResponse() {
    const resp = await this.makeStringResponse('text/html', '', 304);
    resp.removeContentHeaderFields();
    return resp;
  }

  async makeRedirect(target, statusCode=303) {
    const resp = await this.makeHtmlResponse(commonTags.safeHtml`
      <!doctype html>
      <title>Redirecting...</title>
      <p>You are being redirected to <a href="${target}">${target}</a>.</p>
    `, statusCode);
    resp.setHeader('Location', target);
    return resp;
  }

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
  }

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
  }

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
  }

});

// obviously very flawed and opinionated
// TODO: uses first matching token
class AcceptSet {
  constructor(headerKey, tokens) {
    this.tokens = tokens;
    this.headerKey = headerKey;
  }
  qualityFor(givenToken) {
    return this.tokens
      .filter(([token, opts]) => {
        if (this.headerKey === 'accept') {
          if (token === '*/*') return true;
          if (token.endsWith('/*'))
            return token.split('/')[0] === givenToken.split('/')[0];
        } else if (token === '*') return true;
        return token === givenToken;
      })
      .map(x => 'q' in x[1] ? parseFloat(x[1].q) : 1)[0] || 0;
  }
}
