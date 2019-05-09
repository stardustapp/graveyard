GraphEngine.attachBehavior('http-server/v1-beta1', 'Server', {
  // constructor: nodeType, data

  async activate() {
    const listeners = await Promise.all(this.ActiveListeners);
    await Promise.all(listeners.map(l => l.activate()));
    console.log('Started', listeners.length, 'HTTP listeners');
  },

  unrefAll() {
    for (const l of this.ActiveListeners)
      l.unref();
  },

});
