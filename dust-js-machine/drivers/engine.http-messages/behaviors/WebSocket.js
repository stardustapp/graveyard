CURRENT_LOADER.attachBehavior(class WebSocket {

  attachCallback(callback) {
    this.connCallback = callback;
  }

});
