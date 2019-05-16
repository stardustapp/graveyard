GraphEngine.attachBehavior('http-messages/v1-beta1', 'Response', {

  setHeader(Key, Value) {
    // TODO: check if already added
    this.Headers.push({ Key, Value });
  },

  removeContentHeaderFields() {
    this.Headers = this.Headers.filter(x => {
      const key = x.Key.toLowerCase();
      return key.substr(0, 8) !== 'content-' || key === 'content-location';
    });
  },

  isCachable() {
    const {Code} = this.Status;
    return (Code >= 200 && Code < 300) || Code === 304;
  },

  // createNodeJsWriteStream() {
  //   return new MessageBodyWritable(this.);
  // },
});
