// map API to node's net.ClientResponse
class BaseHandler {
  set responseLength(length) {
    if (typeof length === 'number')
      this.response.setHeader('content-length', length);
  }
  set statusCode(code) {
    this.response.statusCode = code;
  }
  setHeader(key, val) {
    this.response.setHeader(key, val);
  }
  writeHeaders() {
    this.response.writeHead(this.response.statusCode);
  }
  write(data) {
    this.response.write(data);
  }
  writeStream(stream) {
    stream.pipe(this.response);
  }
  finish() {
    this.response.end();
  }

  async readBody(req) {
    const cType = req.headers['content-type'] || 'application/octet-stream';
    const [mime, ...extra] = cType.split(';');

    this.request.body = await new Promise(resolve => {
      let chunks = [];
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > 100000) throw new Error(
          `400: that's a lot of bytes! ${size}`);
        chunks.push(chunk);
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });

    switch (mime) {
      case 'application/json':
        break;
      default:
        console.warn('got unknown MIME type', mime, this.request.body);
    }
  }
}

class WebSocketHandler extends BaseHandler {
  // TODO, with a module
}

WSC = { BaseHandler, WebSocketHandler };
