class Session {

  constructor(systemEnv, profile) {
    this.systemEnv = systemEnv;
    this.env = new Environment();

    const {chartName} = profile;
    console.log('launching session for', chartName);

    this.env.mount('/mnt', 'bind', { source: profile.env });
    this.env.mount('/chart-name', 'literal', { string: chartName });
    
  }

  /*
  // /<sessionId>/mnt/<stuff>
  return {
    enumerate(input) {
      return new FolderLiteral('enumeration', [
        new FolderLiteral(''),
        new StringLiteral('test', '123'),
      ]);
    },
    subscribe(newChannel) { return newChannel.invoke(c => {
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf'),
        new FolderLiteral('entry'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf/body'),
        new StringLiteral('entry', 'yup haha'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Added'),
        new StringLiteral('path', 'asdf/status'),
        new StringLiteral('entry', 'todo'),
      ]));
      c.next(new FolderLiteral('notif', [
        new StringLiteral('type', 'Ready'),
      ]));
    })}
  };*/

};
