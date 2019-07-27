exports.DustProfile = class DustProfile {
  constructor(domain, metadata, profileRef) {
    this.domain = domain;
    this.metadata = metadata;
    this.profileRef = profileRef;
  }


  getEntryHandle(path) {
    console.log('    GET', path);
    return new DustProfileEntry(this, path);
  }
  createEnvironment() {
    const env = new Environment;
    env.mount('/profile id', 'literal', {string: this.metadata.profileId});
    env.mount('/created at', 'literal', {string: this.metadata.createdAt.toDate().toISOString()});
    env.mount('/display name', 'literal', {string: this.metadata.displayName});
    env.mount('/contact email', 'literal', {string: this.metadata.contactEmail});
    env.mount('/handle', 'literal', {string: this.metadata.handle});
    env.mount('/type', 'literal', {string: this.metadata.type});
    env.bind('/data', {getEntry: this.getEntryHandle.bind(this)});
    return env;
  }

  refProfilePath(path) {
    if (!path.startsWith('/')) throw new Error(
      `Profile path must be absolute`);

    const parts = path.slice(1).split('/');
    if (path.endsWith('/')) parts.pop();

    let entryRef = this.profileRef;
    for (const part of parts) {
      if (!part) throw new Error(
        `path has empty part`);
      entryRef = entryRef
        .collection('entries')
        .doc(decodeURIComponent(part));
    }
    return entryRef;
  }

  inflateFirestoreEntry(snapshot) {
    if (!snapshot.exists) return null;
    switch (snapshot.get('type')) {

      case 'String':
        return {
          Name: snapshot.id,
          Type: 'String',
          StringValue: snapshot.get('data'),
        };

      case 'Blob':
        return {
          Name: snapshot.id,
          Type: 'Blob',
          Data: snapshot.get('data').toString('base64'),
          Mime: snapshot.get('mime'),
        };

      case 'Folder':
        return {
          Name: snapshot.id,
          Type: 'Folder',
        };

      default:
        console.log('aaaa', snapshot.data());
        throw new Error(`TODO: firestore had '${snapshot.get('type')}' entry`);
    }
  }

  async getPathChildren(parentPath) {
    const childQuery = await this
      .refProfilePath(parentPath)
      .collection('entries')
      .orderBy('__name__')
      //.where('public', '==', true)
      .get();
    console.log('found', childQuery.docs.length, 'children in', parentPath, childQuery.docs.map(x => x.id));
    return childQuery.docs.map(this.inflateFirestoreEntry);
  }

  async getAtPath(path) {
    if (path === '/') return {Type: 'Folder', Name:'root'};

    const entryDoc = await this
      .refProfilePath(path)
      .get();
    if (!entryDoc.exists) return null;
    //console.log('found', entryDoc.data(), 'at', path);
    return this.inflateFirestoreEntry(entryDoc);
  }

  async writeToPath(path, entry) {
    // console.log('--> put', path, entry);
    if (path === '/') throw new Error(
      `can't put to root`);

    let docData;
    switch (entry.Type) {

      case 'Blob':
        if (typeof entry.Mime !== 'string' || !entry.Mime) throw new Error(
          `Mime is a required field for Blobs`);
        if (typeof entry.Data !== 'string') throw new Error(
          `Blob Data is required, even if it's empty`);
        docData = {
          type: 'Blob',
          createdAt: new Date,
          mime: entry.Mime,
          data: Buffer.from(entry.Data, 'base64'),
        };
        break;

      case 'String':
        if (typeof entry.StringValue !== 'string') throw new Error(
          `StringValue is required, even if it's empty`);
        docData = {
          type: 'String',
          createdAt: new Date,
          data: entry.StringValue,
        };
        break;

      case 'Folder':
        if ((entry.Children || []).length > 0) throw new Error(
          `TODO: Creating Folder with preset Children`);
        docData = {
          type: 'Folder',
          createdAt: new Date,
        };
        break;

      default:
        throw new Error(`TODO: Unsupported type ${entry.Type}`);
    }
    if (!docData) throw new Error(
      `BUG: docData was falsey`);

    await this
      .refProfilePath(path)
      .set(docData);
    console.log('    wrote', docData.type, 'to', path);
  }
};

class DustProfileEntry {
  constructor(profile, path) {
    this.profile = profile;
    this.path = path || '/';
  }

  getChildEntry(name) {
    const basePath = this.path + (this.path.endsWith('/') ? '' : '/');
    return new DustProfileEntry(this.profile, `${basePath}${name}/`);
  }
  // const myPath = PathFragment.parse(this.path);

  async get() {
    return await this.profile.getAtPath(this.path);
  }

  async enumerate(enumer, knownSelf=null) {
    const self = knownSelf ? knownSelf : await this.get();
    if (!self) throw new Error(
      `BUG: self is falsey`);
    enumer.visit(self);

    if (enumer.canDescend()) {
      for (const child of await this.profile.getPathChildren(this.path)) {
        enumer.descend(child.Name);
        try {
          const childEntry = this.getChildEntry(child.Name);
          await childEntry.enumerate(enumer, child);
        } catch (err) {
          console.warn('Enumeration had a failed node @', JSON.stringify(child.Name), err);
          enumer.visit({Type: 'Error', StringValue: err.message});
        }
        enumer.ascend();
      }
    }
  }

  async put(entry) {
    if (!entry || !entry.Type) throw new Error(
      `Cannot put empty entries`);

    const existing = await this.get();
    if (existing) {
      if (existing.Type !== entry.Type) throw new Error(
        `TODO: Tried to put a ${entry.Type} over a top a ${existing.Type}`);
      if (entry.Type === 'Folder') throw new Error(
        `TODO: Replacing folders is not yet supported`);
    }

    await this.profile.writeToPath(this.path, entry);
  }
}
