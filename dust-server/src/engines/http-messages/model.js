new GraphEngineBuilder('http-messages/v1-beta1', build => {

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
      { predicate: 'STREAMED', object: 'BodyChunk' },
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
      }},
    },
  });

  // Represents a server-to-client message fulfilling a Request.
  build.node('Response', {
    relations: [
      { subject: 'Connection', predicate: 'RETURNED' },
      { subject: 'Request', predicate: 'RETURNED' },
      { predicate: 'STREAMED', object: 'BodyChunk' },
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
      }},
    },
  });

  // Ordered data chunk to support streaming responses.
  // Sending a zero-length Data packet (of either encoding) terminates the stream.
  build.node('BodyChunk', {
    relations: [
      { subject: 'Request', predicate: 'STREAMED' },
      { subject: 'Response', predicate: 'STREAMED' },
    ],
    fields: {
      Timestamp: Date,
      Sequence: Number,
      Data: { anyOfKeyed: {
        StringData: String,
        Base64: String,
        NativeStream: Boolean,
        ChunkStream: Boolean,
      }},
    },
  });
}).install();
