let allOpenChannels = 0;
setInterval(() => {
  Datadog.Instance.gauge('skylink.server.open_channels', this.allOpenChannels, {});
}, 10*1000);


class ChannelExtension {
  constructor() {
    this.channels = new Map;
    this.nextChan = 1;
  }

  attachTo(skylink) {
    skylink.env.mount('/channels/new', 'function', {
      invoke: this.newChannelFunc.bind(this),
    });
  }

  newChannelFunc(input) {
    Datadog.Instance.count('skylink.channel.opens', 1, {});
    allOpenChannels++;

    const chanId = this.nextChan++;
    const channel = new Channel(chanId);
    this.channels.set(chanId, channel);

    input({
      next(data) { channel.handle({Status: 'Next', Output: data}) },
      error(data) { channel.handle({Status: 'Error', Output: data}) },
      done() { channel.handle({Status: 'Done'}) },
    })
    return channel;
  }
}

// Attaches a 'Chan' field to responses when they pertain to a channel.
// The client gets packets over the original connection and use 'Chan' to differentiate them.
class InlineChannelCarrier {
  constructor(sendCb) {
    this.sendCb = sendCb;
  }

  attachTo(skylink) {
    skylink.outputEncoders.push(this.encodeOutput.bind(this));
  }

  // If you return falsey, you get skipped
  encodeOutput(output) {
    if (output && output.constructor === Channel) {
      return {
        Ok: true,
        Status: 'Ok',
        Chan: output.id,
        _after: this.plumbChannel.bind(this, output),
      };
    }
  }

  plumbChannel(channel) {
    channel.forEachPacket(pkt => {
      console.log(channel.id, pkt);
      pkt.Chan = channel.id;
      this.sendCb(pkt);
    });
  }
}

/*
  transmit(status, output=null) {
    if (!this.open) throw new Error(`Tried to transmit on closed Channel`);
    Datadog.Instance.count('skylink.channel.packets', 1, {transport: 'inline', status});

    this.sendJson({
      Status: 'Next',
      Chan: chanId,
      Output: value,
    });

    if (status !== 'Next') {
      this.open = false;
      InlineChannelExport.openChannels--;
    }
  }
}

class ChannelExportExtension {
  constructor(transport) {
    if (!transport) throw new Error(`Needs a transport`);
    this.transport = transport;
  }

  bindTo(nsexport) {
    // set up some state
    nsexport.channels = new Map;
    nsexport.nextChan = 1;

    // offer async response follow-ups with channels
    // mount in env for processing code
    nsexport.env.mount('/channels/new', 'function', {
      invoke: input => transport.createChannel(nsexport, input),
    });

    // API to stop a channel
    nsexport.externalOps.stop = this.stopOp.bind(this);
  }

  cleanup(nsexport) {
    
  }
}

class SkylinkWebsocketHandler extends WSC.WebSocketHandler {
  constructor(nsExport) {
    super();
    this.nsExport = nsExport;

    // create a new environment just for this connection
    this.localEnv = new Environment();
    this.localEnv.mount('/tmp', 'tmp');
    this.localEnv.bind('/pub', nsExport.namespace); // TODO: prefix /api

    this.channels = new Map;
    this.nextChan = 1;

    this.isActive = false;
    this.reqQueue = new Array;
  }

  sendJson(body) {
    if (this.ws_connection) {
      this.write_message(JSON.stringify(body));
    } else {
      console.warn(`TODO: channel's downstream inline isnt connected anymore`)
    }
  }

  processRequest(request) {
    this.nsExport.processOp(request, this.localEnv).then(output => {
      if (output && output.channelId) {
        this.sendJson({
          Ok: true,
          Status: 'Ok',
          Chan: output.channelId,
        });
        output.start();
      } else {
        this.sendOutput(true, output);
      }

    }, (err) => {
      const stackSnip = (err.stack || new String(err)).split('\n').slice(0,4).join('\n');
      console.warn('!!! Operation failed with', stackSnip);
      this.sendOutput(false, {
        Type: 'String',
        Name: 'error-message',
        StringValue: err.message,
      });
    }).then(() => {
      // we're done with the req, move on
      if (this.reqQueue.length) {
        this.processRequest(this.reqQueue.shift());
      } else {
        this.isActive = false;
      }
    });
  }
}

*/
