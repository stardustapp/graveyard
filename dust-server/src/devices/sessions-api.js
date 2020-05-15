window.SessionsApiDriver = class SessionsApiDriver extends PlatformApi {
  constructor(account, input={}) {
    super('sessions');

    this.account = account;
    this.input = input;

  /*this.getter(path, type, impl) {
    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    this.paths.set(path, new PlatformApiGetter(this, baseName, type, impl));
    return this;
  }
  function(path, args) {
    const baseName = decodeURIComponent(path.slice(1).split('/').slice(-1)[0]);
    this.paths.set(path, new PlatformApiFunction(this, baseName, args));
    return this;
  }*/

    this.function('/new', {
      input: {
        lifetime: 'long',
        client: 'sessions api',
      },
      output: {
        id: String,
        url: String,
      },
      impl: this.newSession,
    });
  }

  newSession({lifetime, client}) {
    throw new Error('TODO');
  }
}
