GraphEngine.attachBehavior('http-messages/v1-beta1', 'WebSocket', {

  attachCallback(callback) {
    this.connCallback = callback;
  },

});
