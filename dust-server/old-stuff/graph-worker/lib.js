class ExtendableError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

function randomString(bytes=10) { // 32 for a secret
  var array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return base64js
    .fromByteArray(array)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

class PathRouter {
  constructor() {
    this.routes = [];
  }

  registerHandler(pattern, handler) {
    const path = PathFragment.from(pattern);
    if (this.routes.find(x => x.path.equals(path))) {
      throw new Error(`Tried double-registering '${pattern}' in router`);
    }
    this.routes.push({path, handler});
  }

  async routeInput(path, input, fallbackCb) {
    for (const route of this.routes) {
      const match = path.matchWith(route.path);
      if (match.ok) {
        //if (!route.path.toString().includes('xhr'))
        //  console.debug(`Matched ${path} to ${route.path} with`, match.params);
        input.params = match.params;
        try {
          return await route.handler(match, input);
        } catch (err) {
          return new Response(err.stack, {
            status: 500,
            headers: {
              'Content-Type': 'text/plain',
            },
          });
        }
      }
    }
    console.warn(`Didn't match ${path}, falling back`);
    return fallbackCb(input);
  }
}

function wrapGatePage(title, inner) {
  return new Response(commonTags.safeHtml`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <link href="/~~libs/vendor/fonts/roboto.css" type="text/css" rel="stylesheet">
      <link href="/~~libs/vendor/fonts/material-icons.css" type="text/css" rel="stylesheet">
      <link href="/~/style.css" type="text/css" rel="stylesheet" media="screen,projection" />
    </head>
    <body>
      `+'\n\n  '+inner.split('\n').join('\n  ')+'\n\n  '+commonTags.safeHtml`

      <div class="fill"></div>

      <footer>
        powered by the Stardust platform,
        built by
        <a href="http://danopia.net">danopia</a>
      </footer>
    </body>
    </html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
