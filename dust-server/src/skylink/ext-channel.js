let allOpenChannels = 0;
setInterval(() => {
  Datadog.Instance.gauge('skylink.server.open_channels', allOpenChannels, {});
}, 10*1000);

// for the server
class ChannelExtension {
  constructor() {
    this.channels = new Map;
    this.nextChan = 1;
  }

  attachTo(skylink) {
    skylink.shutdownHandlers.push(this.handleShutdown.bind(this));
    skylink.env.mount('/channels/new', 'function', {
      invoke: this.newChannelFunc.bind(this),
    });
  }

  handleShutdown() {
    for (const chan of this.channels.values()) {
      chan.triggerStop(new StringLiteral('reason', 'Skylink is shutting down'));
    }
    this.channels.clear();
  }

  newChannelFunc(input) {
    Datadog.Instance.count('skylink.channel.opens', 1, {});
    allOpenChannels++;

    const chanId = this.nextChan++;
    const channel = new Channel(chanId);
    this.channels.set(chanId, channel);

    // Wire a way to async-signal the origin *once*
    const stopPromise = new Promise(resolve => {
      channel.triggerStop = resolve;
    });

    // Pass a simplified API to the thing that wanted the channel
    input({
      next(Output) {
        channel.handle({Status: 'Next', Output});
        Datadog.Instance.count('skylink.channel.packets', 1, {status: 'next'});
      },
      error(Output) {
        channel.handle({Status: 'Error', Output});
        allOpenChannels--;
        Datadog.Instance.count('skylink.channel.packets', 1, {status: 'error'});
      },
      done() {
        channel.handle({Status: 'Done'});
        allOpenChannels--;
        Datadog.Instance.count('skylink.channel.packets', 1, {status: 'done'});
      },
      onStop(cb) {
        stopPromise.then(cb);
      },
    });
    return channel;
  }
}
