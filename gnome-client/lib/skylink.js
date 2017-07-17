const Soup = imports.gi.Soup;
const byteArray = imports.byteArray;

const Promise = imports.promise.Promise;

const Skylink = function (prefix, endpoint) {
  this.endpoint = endpoint || 'https://stardust.apt.danopia.net/~~export';
  this.prefix = prefix || '';

  this.transport = 'http';
  if (this.endpoint.startsWith('ws')) {
    this.transport = 'ws';
  }

  this.session = new (this.transport == 'ws' ? Soup.Session : Soup.SessionAsync)({
    user_agent: "Stardust/0.1",
  });
  this.session.httpsAliases = ["wss"];
  Soup.Session.prototype.add_feature.call(this.session,
    new Soup.ProxyResolverDefault());

  let logger = Soup.Logger.new(Soup.LoggerLogLevel.NONE, -1); // BODY, HEADERS, MINIMAL
  logger.attach(this.session);
  logger.set_printer(function(logger, level, direction, data) { print(data); });
}

//////////////////////////////////////
// First-order operations

Skylink.prototype.ping = function () {
  return this.exec({Op: 'ping'}).then(x => x.Ok);
}

Skylink.prototype.get = function (path) {
  return this.exec({
    Op: 'get',
    Path: this.prefix + path,
  }).then(x => x.Output);
}

Skylink.prototype.enumerate = function (path, opts={}) {
  const maxDepth = opts.maxDepth == null ? 1 : +opts.maxDepth;
  const shapes = opts.shapes || [];
  return this.exec({
    Op: 'enumerate',
    Path: this.prefix + path,
    Depth: maxDepth,
    Shapes: shapes,
  }).then(res => {
    const list = res.Output.Children;
    if (opts.includeRoot === false) {
      list.splice(0, 1);
    }
    return list;
  });
}

Skylink.prototype.store = function (path, entry) {
  return this.exec({
    Op: 'store',
    Dest: this.prefix + path,
    Input: entry,
  });
}

Skylink.prototype.invoke = function (path, input, outputPath) {
  return this.exec({
    Op: 'invoke',
    Path: this.prefix + path,
    Input: input,
    Dest: outputPath ? (this.prefix + outputPath) : '',
  }).then(x => x.Output);
}

Skylink.prototype.copy = function (path, dest) {
  return this.exec({
    Op: 'copy',
    Path: this.prefix + path,
    Dest: this.prefix + dest,
  });
}

Skylink.prototype.unlink = function (path) {
  return this.exec({
    Op: 'unlink',
    Path: this.prefix + path,
  });
}

//////////////////////////////////////
// Helpers using the core operations

Skylink.prototype.fetchShape = function (path) {
  return this.enumerate(path, {
    maxDepth: 3,
  }).then(x => {
    const shape = {
      path: path,
    };
    const props = new Map();

    x.forEach(item => {
      const parts = item.Name.split('/');
      if (item.Name === 'type') {
        shape.type = item.StringValue;
      } else if (item.Name === 'props') {
        shape.props = true;
      } else if (parts[0] === 'props' && parts.length == 2) {
        if (item.Type === 'String') {
          props.set(parts[1], {
            name: parts[1],
            type: item.StringValue,
            shorthand: true,
          });
        } else if (item.Type === 'Folder') {
          props.set(parts[1], {
            name: parts[1],
            shorthand: false,
          });
        }
      } else if (parts[0] === 'props' && parts[2] === 'type') {
        props.get(parts[1]).type = item.StringValue;
      } else if (parts[0] === 'props' && parts[2] === 'optional') {
        props.get(parts[1]).optional = item.StringValue === 'yes';
      }
    });

    if (shape.props) {
      shape.props = [];
      props.forEach(prop => shape.props.push(prop));
    }
    return shape;
  });
}

Skylink.prototype.mkdirp = function (path2) {
  const parts = path2.slice(1).split('/');
  var path = '';
  const nextPart = () => {
    if (parts.length === 0) {
      return true;
    }
    const part = parts.shift();
    path += '/' + part;
    return this.get(path)
      .then(x => true, x => {
        console.log('mkdirp got failure', x);
        if (x.Ok === false) {
          return this.store(path, Skylink.Folder(part));
        }
        return Promise.reject(x);
      })
      .then(nextPart);
  };
  return nextPart();
}

// File-based API

Skylink.prototype.putFile = function (path, data) {
  const nameParts = path.split('/');
  const name = nameParts[nameParts.length - 1];
  return this.store(path, Skylink.File(name, data));
}

Skylink.prototype.loadFile = function (path) {
  return this.get(path).then(x => {
    if (x.Type !== 'File') {
      return Promise.reject('Expected '+path+' to be a File but was '+x.Type);
    } else {
      return atob(x.FileData || '');
    }
  });
}

// String-based API

Skylink.prototype.putString = function (path, value) {
  const nameParts = path.split('/');
  const name = nameParts[nameParts.length - 1];
  return this.store(path, Skylink.String(name, value));
}

Skylink.prototype.loadString = function (path) {
  return this.get(path).then(x => {
    if (x.Type !== 'String') {
      return Promise.reject('Expected '+path+' to be a String but was '+x.Type);
    } else {
      return x.StringValue || '';
    }
  });
}

//////////////////////////////////////
// Helpers to build an Input

Skylink.String = function (name, value) {
  return {
    Name: name,
    Type: 'String',
    StringValue: value,
  };
}

Skylink.File = function (name, data) {
  return {
    Name: name,
    Type: 'File',
    FileData: btoa(data),
  };
}

Skylink.Folder = function (name, children) {
  return {
    Name: name,
    Type: 'Folder',
    Children: children || [],
  };
}


Skylink.prototype.exec = function (request) {
  switch (this.transport) {
    case 'http':
      return this.execHttp(request);
    case 'ws':
      return this.execWs(request);
  }
}

function wsTransport(session, endpoint) {
  this.conn = new Promise(resolve => {
    const message = new Soup.Message({
      method: 'GET',
      uri: new Soup.URI(endpoint),
    });

    const callback = (session, res) => {
      const connection = session.websocket_connect_finish(res);
      print("connected to " + endpoint);
      resolve(connection);
    }

    print("connecting websocket...");
    session.websocket_connect_async(message, 'https://stardust.apt.danopia.net', null, null, callback);
  });

  this.conn.then(conn => {
    conn.connect("message", this.onMessage);
    conn.connect("closed", this.onClosed);
    conn.connect("error", this.onErrored);
  })

  var pendingCbs = [];

  this.onMessage = (connection, type, message) => {
    let data = JSON.parse(message.get_data());
    //print('<<< ' + JSON.stringify(data, null, 2));

    const cb = pendingCbs.shift();
    cb(data);
    //  this.conn.close(Soup.WebsocketCloseCode.NORMAL, "fare thee well, my friend");
  }

  this.onClosed = (connection) => {
    print("ws connection closed");
  }
  this.onErrored = (error) => {
    print("ws connection failed " + (error.stack || error.toString()));
  }

  this.volley = (data) => {
    return this.conn.then(conn => new Promise(resolve => {
      //print('>>> ' + conn.state +  JSON.stringify(data, null, 2));
      print('>>> ' + data.Op + ' ' + data.Path + ' ' + data.Dest);
      pendingCbs.push(resolve);
      conn.send_text(JSON.stringify(data));
    }));
  }
}

Skylink.prototype.execWs = function (reqData) {
  this.wsTransport = this.wsTransport || new wsTransport(this.session, this.endpoint);
  return this.wsTransport
    .volley(reqData)
    .then(this.checkOk);
}


Skylink.prototype.execHttp = function (reqData) {
  return new Promise((resolve, reject) => {
    let request = Soup.Message.new('POST', this.endpoint);
    request.request_headers.append('Accept', 'application/json');
    request.request_headers.append('Content-Type', 'application/json');
    const reqBody = byteArray.fromString(JSON.stringify(reqData));
    request.set_request('application/json', Soup.MemoryUse.COPY, reqBody);

    this.session.queue_message(request, (source, message) => {
      // this.headers = message.response_headers;
      // this.url = message.get_uri().to_string(false);
      // this.status = message.status_code;
      // this.statusText = Soup.Status.get_phrase(this.status);
      // this.ok = (this.status === Soup.Status.OK);
      if (message.status_code !== 200) {
        reject("Skylink received an HTTP " + message.status_code)
      }
      resolve(JSON.parse(message.response_body.data.toString()));
    });
  })
  .then(this.checkOk);
}

// Chain after a json() promise with .then()
Skylink.prototype.checkOk = function (obj) {
  if (obj.ok === true || obj.Ok === true) {
    return obj;
  } else {
    //alert(`Stardust operation failed:\n\n${obj}`);
    return Promise.reject(obj);
  }
}
