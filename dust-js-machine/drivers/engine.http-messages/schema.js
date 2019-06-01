CURRENT_LOADER.attachModel(build => {

  // Represents an actual TCP connection between a client and a server.
  // Includes information on the socket for addressing purposes.
  // Note that connections are a hop-to-hop concept in HTTP. Since the client
  //   and/or the server might be a proxy, this is not always representative
  //   of the actual client or server that issued the messages.
  // HTTP is stateless, so NEVER give special meaning to specific connections!
  build.node('Connection', {
    relations: [
      { kind: 'top' },
      // Messages that can pass over a connection.
      { predicate: 'ISSUED', object: 'Request' },
      { predicate: 'RETURNED', object: 'Response' },
      { predicate: 'UPGRADED', object: 'WebSocket' },
    ],
    fields: {
      OpenedAt: Date,
      ClosedAt: { type: Date, optional: true },

      WireProtocol: String,
      SocketFamily: String,
      Server: { fields: {
        Address: String,
        Port: Number,
      }, optional: true },
      Peer: { fields: {
        Address: String,
        Port: Number,
      }, optional: true },
    },
  });

  // Represents a client-to-server request.
  build.node('Request', {
    relations: [
      { subject: 'Connection', predicate: 'ISSUED' },
      { predicate: 'RETURNED', object: 'Response' },
      { predicate: 'STREAMED', object: 'Frame' },
    ],
    fields: {
      Timestamp: Date,
      // raw request line
      Method: String,
      Url: String,
      HttpVersion: String,
      // raw header list
      Headers: { fields: {
        Key: String,
        Value: String,
      }, isList: true },
      // processed fields
      RemoteAddress: String, // accounts for proxies
      HostName: String,
      AltPort: { type: Number, optional: true },
      Origin: String,
      Path: String,
      Query: { fields: {
        Key: String,
        Value: String,
      }, isList: true },
      // attached data
      Body: { anyOfKeyed: {
        StringData: String,
        Base64: String,
        Stream: Boolean,
        HttpUpgrade: Boolean,
      }},
    },
  });

  // Represents a server-to-client message fulfilling a Request.
  build.node('Response', {
    relations: [
      { subject: 'Connection', predicate: 'RETURNED' },
      { subject: 'Request', predicate: 'RETURNED' },
      { predicate: 'STREAMED', object: 'Frame' },
    ],
    fields: {
      Timestamp: Date,
      Status: { fields: {
        Code: Number,
        Message: { type: String, optional: true },
      }},
      Headers: { fields: {
        Key: String,
        Value: String,
      }, isList: true },
      Body: { anyOfKeyed: {
        StringData: String,
        Base64: String,
        NativeStream: Boolean,
        ChunkStream: Boolean,
        // TODO: Stream: { reference: { engine: 'streaming', name: 'ByteStream' }}
        WebSocket: { reference: 'WebSocket' },
      }},
    },
  });

  // Ordered data chunk to support streaming responses.
  // Sending a zero-length Data packet (of either encoding) terminates the stream.
  build.node('Frame', {
    relations: [
      { subject: 'Request', predicate: 'STREAMED' },
      { subject: 'Response', predicate: 'STREAMED' },
      { subject: 'WebSocket', predicate: 'STREAMED' },
    ],
    fields: {
      Timestamp: Date,
      Sequence: Number,
      // inner value
      Data: { anyOfKeyed: {
        StringData: String,
        Base64: String,
      }},
      // extra stuff for WS
      WebSocketFlags: { fields: {
        Incomplete: { type: Boolean, defaultValue: false },
        Source: { type: String, allowedValues: [
          'Client', 'Server'
        ]},
        // markers can only have 126 bytes of data
        Control: { type: String, allowedValues: [
          'Continuation', // 0x00
          'CloseSocket', // 0x08
          'Ping', // 0x09
          'Pong', // 0x0a
        ]},
      }},
    },
  });

  build.node('WebSocket', {
    relations: [
      { subject: 'Connection', predicate: 'UPGRADED' },
      { subject: 'Request', predicate: 'UPGRADED' },
      { predicate: 'STREAMED', object: 'Frame' },
    ],
    fields: {
      ReadyState: Number,
    },
  });

});
