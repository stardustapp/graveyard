new GraphEngineBuilder('http-messages/v1-beta1', build => {

  build.node('Connection', {
    relations: [
      { kind: 'top' },
      { predicate: 'ISSUED', object: 'Request' },
      { predicate: 'RETURNED', object: 'Response' },
    ],
    fields: {
      OpenedAt: Date,
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

  build.node('Request', {
    relations: [
      { subject: 'Connection', predicate: 'ISSUED' },
      { predicate: 'RETURNED', object: 'Response' },
    ],
    fields: {
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
      //Origin: String, // TODO: calculate uri
      Path: String,
      Query: { fields: {
        Key: String,
        Value: String,
      }, isList: true },
      // attached data
      Body: { anyOfKeyed: {
        StringData: String,
        Base64: String,
        // TODO: Stream: { reference: { engine: 'streaming', name: 'ByteStream' }}
      }},
    },
  });

  build.node('Response', {
    relations: [
      { subject: 'Connection', predicate: 'RETURNED' },
      { subject: 'Request', predicate: 'RETURNED' },
    ],
    fields: {
      Status: { fields: {
        Code: Number,
        Message: String,
      }},
      Headers: { fields: {
        Key: String,
        Value: String,
      }, isList: true },
      Body: { anyOfKeyed: {
        StringData: String,
        Base64: String,
        // TODO: Stream: { reference: { engine: 'streaming', name: 'ByteStream' }}
      }, defaultValue: {
        Base64: '',
      }},
    },
  });
}).install();
