GraphEngine.attachBehavior('http-messages/v1-beta1', 'Response', {

  setHeader(Key, Value) {
    // TODO: check if already added
    this.Headers.push({ Key, Value });
  },

});
