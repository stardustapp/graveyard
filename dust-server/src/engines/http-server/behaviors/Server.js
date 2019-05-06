GraphEngine.attachBehavior('http-server/v1-beta1', 'Server', {
  // constructor: nodeType, data

  async setup() {
    const listeners = await Promise.all(this.ActiveListeners);
    await Promise.all(listeners.map(l => l.start()));
    console.log('Started', listeners.length, 'HTTP listeners');
  },

});
