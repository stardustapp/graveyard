const admin = require("firebase-admin");

const {CreateMapCache, FirestoreMap} = require('./firestore-map.js');

class DomainHandle extends FirestoreMap {
  constructor(context, domainId, handleId) {
    super(context);
    this.domainId = domainId;
    this.handleId = handleId;
  }
}
class SessionHandle extends FirestoreMap {
  constructor(context, domainId, sessionId) {
    super(context);
    this.domainId = domainId;
    this.sessionId = sessionId;
  }
}

exports.FirestoreDomain = class FirestoreDomain extends FirestoreMap {
  constructor(context, domainId, domainRef) {
    super(context);
    this.domainId = domainId;
    this.rootRef = domainRef;

    // this.fqdn = credentialName+'.local';
    // this.domainId = credentialName;

    this.handleCache = CreateMapCache({
      refDoc: handleId => this.refHandle(handleId),
      constr: handleId => new DomainHandle(this.context, this.domainId, handleId),
    });
    this.sessionCache = CreateMapCache({
      refDoc: sessionId => this.refSession(sessionId),
      constr: sessionId => new SessionHandle(this.context, this.domainId, sessionId),
    });
  }

  hasAccessTerm(term) {
    return this.snapshot.access.includes(term);
  }

  async bootstrap() {
    console.log('TODO: bootstrapping domain', this.domainId);
  }

  refHandle(handleId) {
    return this.rootRef
      .collection('handles')
      .doc(handleId);
  }

  refSession(sessionId) {
    return this.rootRef
      .collection('sessions')
      .doc(sessionId);
      // .get().then(x => x.data());
  }

  async createRootSession(uid, metadata={}) {
    const userRecord = await this.context.adminApp.auth().getUser(uid);
    const handles = await this.listHandlesForUser(uid);

    const now = new Date;
    const session = await this.createSession({
      type: 'RootSession',
      uid, metadata,
      createdAt: now,
      expiresAt: new Date(+now + (1/*days*/ * 24 * 60 * 60 * 1000)),
      devices: [
        ...handles.map(handle => ({
          path: '/data/~'+encodeURIComponent(handle.get('handle')),
          type: 'Handle',
          domainId: this.domainId,
          handleId: handle.id,
        })),
        {path: '/system/chart-name', type: 'String', value: 'todo'},
        {path: '/system/user-id', type: 'String', value: uid},
      ],
    });

    return {
      ...session,
      metadata: {
        chartName: 'todo', // account.record.username,
        homeDomain: this.domainId,
        ownerName: userRecord.displayName,
        ownerEmail: userRecord.email,
      },
    }
  }

  async createHandleSession(handleIn, metadata={}) {
    const handle = await this.refHandle(handleIn.toLowerCase()).get();

    const now = new Date;
    const session = await this.createSession({
      type: 'HandleSession',
      handle: handle.id,
      metadata,
      createdAt: now,
      expiresAt: new Date(+now + (1/*days*/ * 24 * 60 * 60 * 1000)),
      devices: [
        {
          path: '/data',
          type: 'Handle',
          domainId: this.domainId,
          handleId: handle.id,
        },
        {path: '/system/chart-name', type: 'String', value: handle.get('handle')},
        {path: '/system/user-id', type: 'String', value: handle.get('uid')},
      ],
    });

    return {
      ...session,
      metadata: {
        homeDomain: this.domainId,
        chartName: handle.get('handle'),
        ownerName: handle.get('metadata.displayName'),
        ownerEmail: handle.get('metadata.contactEmail'),
      },
    }
  }

  async createSession(data) {
    const sessionRef = await this.rootRef
      .collection('sessions')
      .add(data);
    return {
      sessionId: sessionRef.id,
      sessionPath: '/pub/sessions/' + sessionRef.id,
    };
  }

  async fetchHandleSnap(handle) {
    const handleSnap = await this.refHandle(handle.toLowerCase()).get();
    if (!handleSnap.exists) throw new Error(`Handle ${handle} not found on this domain`);
    return handleSnap.data();
  }

  async registerHandle({handle, uid, contactEmail, displayName, extraDevices=[]}) {
    // if (fqdn !== this.fqdn) throw new Error(
    //   `received fqdn ${fqdn} but this domain is ${this.fqdn}`);
    if (typeof handle !== 'string') throw new Error(
      `handle is required to register a handle`);
    if (typeof uid !== 'string') throw new Error(
      `uid is required to register a handle`);
    if (typeof contactEmail !== 'string') throw new Error(
      `contactEmail is required to register a handle`);
    if (typeof displayName !== 'string') throw new Error(
      `displayName is required to register a handle`);
    const handleId = handle.toLowerCase();

    const userRecord = await this.context.adminApp.auth().getUser(uid);

    const db = this.context.adminApp.firestore();

    // const existingProfile = await db
    //   .collection('profiles')
    //   // .doc(someRandomUserId)
    //   // .collection('feed')
    //   .where('uid', '==', uid)
    //   //.where('timestamp', '<=', 1509889854742) //Or something else
    //   .get();

    const userRef    =        db.collection('users'    ).doc(uid);
    const configRef  =        db.collection('libraries').doc();
    const dataRef    =        db.collection('libraries').doc();
    const publicRef  =        db.collection('libraries').doc();
    const domainRef  =        db.collection('domains'  ).doc(this.domainId);
    const handleRef  = domainRef.collection('handles'  ).doc(handleId);
    await db.runTransaction(async t => {

      const [existingUser, existingHandle] = await Promise
        .all([
          t.get(userRef),
          t.get(handleRef),
        ]);

      // check if user is allowed a new handle on this domain
      const handlesInDomain = (existingUser.get('handles')||[])
        .filter(x => x.domainId === this.domainId);
      console.log('current handles for', uid, 'are', handlesInDomain);
      if (handlesInDomain.length >= 1) return Promise.reject(new Error(
        `You already have too many profiles on this domain and cannot create more.`));

      console.log('existing handle for', handle, 'is', existingHandle.data());
      if (existingHandle.exists) return Promise.reject(new Error(
        `Handle "${handle}" is already taken on ${this.domainId}`));

      // t.set(profileRef, {
      //   type: 'identity',
      //   handle,
      //   uid,
      //   contactEmail,
      //   displayName,
      //   createdAt: new Date,
      // });

      t.update(userRef, {
        handles: admin.firestore.FieldValue
          .arrayUnion({domainId: this.domainId, handleId}),
      });

      const owner = {
        uid, handleId,
        domainId: this.domainId,
      };
      t.set(configRef, {
        type: 'TreeLibrary',
        name: `Application settings`,
        createdAt: new Date,
        owner, access: ['owned'],
      });
      t.set(dataRef, {
        type: 'TreeLibrary',
        name: `Application data`,
        createdAt: new Date,
        owner, access: ['owned'],
      });
      t.set(publicRef, {
        type: 'TreeLibrary',
        name: `Published by ~${handle}`,
        createdAt: new Date,
        owner, access: ['public-read', 'owned'],
      });

      t.set(handleRef, {
        handle,
        uid,
        type: 'UserHandle',
        metadata: {
          contactEmail,
          displayName,
          createdAt: new Date,
        },
        devices: [
          //{path: '/identity', type: 'EmptyReadOnlyDir'},
          { path: '/config', type: 'Library', libraryId: configRef.id },
          { path: '/data', type: 'Library', libraryId: dataRef.id },
          { path: '/public', type: 'Library', libraryId: publicRef.id },
          // {path: '/system/chart-name', type: 'String', value: 'todo'},
          // {path: '/system/user-id', type: 'String', value: uid},
          ...extraDevices,
        ],
      });
    });

    // fill in any blanks on the UserRecord
    const userPromises = [];
    if (!userRecord.displayName) {
      userPromises.push(this.context.adminApp.auth()
        .updateUser(uid, {displayName}));
    }
    if (!userRecord.email) {
      userPromises.push(this.context.adminApp.auth()
        .updateUser(uid, {email: contactEmail}));
    }
    await Promise.all(userPromises).catch(err => console.warn(
      'Failed to update userRecord', userRecord, 'at registration time:', err));

    // return profileRef.id;
  }

  async listHandlesForUser(uid) {
    const handleQuery = await this.rootRef
      .collection('handles')
      // .where('type', '==', 'identity')
      .where('uid', '==', uid)
      //.where('timestamp', '<=', 1509889854742) //Or something else
      .get();
    console.log('found handles', handleQuery.docs.map(x => x.get('handle')));
    return handleQuery.docs;
  }

  // async getProfileById(profileId) {
  //   const profileDoc = await this.rootRef
  //     .collection('profiles')
  //     .doc(profileId)
  //     .get();
  //   if (!profileDoc.exists) throw new Error(
  //     `Profile ${profileId} not found`);
  //   return profileDoc.data();
  // }

  // async openProfile(profileId, uid=null) {
  //   const metadata = await this.getProfileById(profileId);
  //   if (metadata.uid && metadata.uid !== uid) throw new Error(
  //     `This profile belongs to a different user`);
  //
  //   return new DustProfile(this, profileId, metadata);
  // }

  async claimRootAsUser(uid, {contactEmail, displayName}={}) {
    console.log('Domain', this.domainId, 'getting claimed by', uid, '!');
    const domainSnap = await this.rootRef.get();
    if (!domainSnap.get('access').includes('unclaimed')) throw new Error(
      `Domain ${this.domainId} is not unclaimed, cannot claim it`);
    const domainDevices = domainSnap.get('devices');

    console.log('assigning libraries', domainDevices, 'to', uid, '...');
    for (const device of domainDevices) {
      if (device.type !== 'Library') continue;
      await this.context
        .adminApp.firestore()
        .collection('libraries')
        .doc(device.libraryId)
        .update({
          'owner.uid': uid,
        });
    }

    console.log('Claiming domain', this.domainId);
    await this.rootRef.update({
      claimedAt: new Date,
      access: ['owned', 'invite-only'],
      verifications: null,
      'owner.uid': uid,
    });

    console.log('Creating root handle for', this.domainId);
    await this.registerHandle({
      handle: 'root',
      uid,
      contactEmail: contactEmail || 'root@'+this.domainId,
      displayName: displayName || 'Domain Administrator',
      extraDevices: domainDevices.map(x => {
        const {path, ...others} = x;
        return {path: '/domain'+path, ...others};
      }),
    });

    console.log('Domain', this.domainId, 'is now claimed.');
  }
};
