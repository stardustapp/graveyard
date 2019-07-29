const fs = require('fs');
const os = require('os');
const {join, basename, extname} = require('path');

const credDir = join(os.homedir(), '.config', 'dust-firebase-server', 'credentials');
const configDir = join(os.homedir(), '.config', 'dust-firebase-server', 'configs');

const availCreds = fs.readdirSync(credDir).filter(x => extname(x) === '.json');
console.log('Available credentials:', availCreds);
if (availCreds.length !== 1) throw new Error(
  `TODO: found non-1 amount of Firebase credentials`);
const serviceAccount = require(join(credDir, availCreds[0]));
exports.mainCredName = basename(availCreds[0], '.json');

const firebase = require('firebase');
const admin = require("firebase-admin");

// const {AsyncCache} = require('../../../rt/nodejs/src/utils/async-cache.js');
// const {Channel} = require('../../../rt/nodejs/src/old/channel.js');

const {FirestoreLibrary} = require('./firestore-library.js');
const {CreateMapCache, FirestoreMap} = require('./firestore-map.js');

class DomainHandle extends FirestoreMap {
  constructor(domain, handleId) {
    super(domain);
    this.handleId = handleId;
  }
}

// class DustProfile extends FirestoreLibrary {
//   constructor(domain, profileId, metadata) {
//     super(domain
//       .adminApp.firestore()
//       .collection('domains')
//       .doc(domain.domainId)
//       .collection('profiles')
//       .doc(profileId));
//
//     this.domain = domain;
//     this.profileId = profileId;
//     this.metadata = metadata;
//   }
//   createWrappingEnvironment() {
//     const env = new Environment;
//     env.mount('/profile%20id', 'literal', {string: this.profileId});
//
//     for (const key in this.metadata) {
//       if (this.metadata[key] === null) continue;
//       const name = key.replace(/[a-z][A-Z]+/g, (x => x[0]+' '+(x.length>2 ? x.slice(1) : x[1].toLowerCase())));
//       env.mount('/metadata/'+encodeURIComponent(name), 'literal', {
//         string: this.metadata[key].toString(),
//       });
//     }
//
//     env.bind('/data', this);
//     return env;
//   }
// }

exports.DustDomain = class DustDomain {
  constructor(credentialName) {
    this.credentialName = credentialName;

    this.adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${credentialName}.firebaseio.com`,
    }, credentialName);
    //this.adminApp.firestore().enableLogging(true);

    // var actionCodeSettings = {
    //   // The URL to redirect to for sign-in completion. This is also the deep
    //   // link for mobile redirects. The domain (www.example.com) for this URL
    //   // must be whitelisted in the Firebase Console.
    //   url: 'http://localhost:9239/~/login/oob',
    //   handleCodeInApp: true,
    //   //dynamicLinkDomain: 'custom.page.link'
    // };
    // this.adminApp.auth()
    //     .generateSignInWithEmailLink('user@example.com', actionCodeSettings)
    //     .then(console.log)
    // this.spawnClientApp().auth()
    //   .fetchSignInMethodsForEmail('dan@danopia.net')
    //   .then(console.log);

    this.fqdn = credentialName+'.local';
    this.domainId = credentialName;

    // this.handleCache = new AsyncCache({
    //   loadFunc: this.loadHandle.bind(this),
    // });
    this.handleCache = CreateMapCache(
      handleId => this
        .adminApp.firestore()
        .collection('domains')
        .doc(this.domainId)
        .collection('handles')
        .doc(handleId),
      handleId => new DomainHandle(this, handleId));
  }

  async loadHandle(handleId) {
    const handleRef = this.adminApp.firestore()
      .collection('domains')
      .doc(this.domainId)
      .collection('handles')
      .doc(handleId);
    const snapChannel = new Channel(`handle/${handleId}`);
    let stopFunc, firstSnap;
    firstSnap = await new Promise((resolve, reject) => {
      stopFunc = handleRef.onSnapshot(snapshot => {
        const data = snapshot.exists ? snapshot.data() : null;
        if (firstSnap) {
          snapChannel.handle({Status: 'Next', Output: data});
        } else resolve(data);
      }, err => {
        console.log('session err', err);
        snapChannel.handle({Status: 'Error', Output: err});
        reject(err);
      });
    });
    try {

      if (!firstSnap) throw new Error(
        `Handle '${handleId}' not found, cannot load`);
      // if (firstSnap.expiresAt < new Date) throw new Error(
      //   `Session ${sessionId} has expired, cannot load`);

      console.log('loading handle', handleId, firstSnap.metadata);
      const handle = new DomainHandle(this.domain, handleId);
      await handle.applyData(firstSnap);

      snapChannel.forEach(snapshot => {
        return handle.applyData(snapshot);
      });

      return handle;
    } catch (err) {
      stopFunc();
      throw err;
    }
  }

  async markUserSeen(uid) {
    const db = this.adminApp.firestore();
    await db
      .collection('users')
      .doc(uid)
      .set({
        lastSeen: new Date,
      }, {merge: true});
  }

  async makeCSRF(uid) {
    const db = this.adminApp.firestore();
    const csrfDoc = await db
      .collection('users')
      .doc(uid)
      .collection('csrfs')
      .add({
        createdAt: new Date,
        authority: this.fqdn,
      });
    return csrfDoc.id;
  }

  async checkCSRF(csrf, uid) {
    if (!csrf) throw new Error(
      `The form you submitted is missing a security token. Maybe you clicked a bad link?`);

    const db = this.adminApp.firestore();
    const csrfDoc = await db
      .collection('users')
      .doc(uid)
      .collection('csrfs')
      .doc(csrf)
      .get();

    if (!csrfDoc.exists) throw new Error(
      `The form's security token could not be found. Maybe you clicked a bad link?`);

    const oldestOk = new Date - (60 * 60 * 1000); // 1 hour
    if (csrfDoc.get('createdAt') < oldestOk) throw new Error(
      `The form's security token has expired. Please try re-submitting.`);

    if (csrfDoc.get('authority') !== this.fqdn) throw new Error(
      `The form's security token is for a different domain. Maybe you clicked a bad link?`);
  }

  async linkToEmailPassword({uid, email, desired}) {
    const customToken = await this.adminApp.auth()
      .createCustomToken(uid);

    const clientApp = this.spawnClientApp();
    try {
      const {user} = await clientApp.auth()
        .signInWithCustomToken(customToken);
      const newUserCred = await user.linkWithCredential(
        firebase.auth.EmailAuthProvider
          .credential(email, desired));
      return await newUserCred.user.getIdToken();
    } finally {
      await clientApp.delete();
    }
  }

  refSession(sessionId) {
    const db = this.adminApp.firestore();
    return db
      .collection('domains')
      .doc(this.domainId)
      .collection('sessions')
      .doc(sessionId);
      // .get().then(x => x.data());
  }

  async createRootSession(uid, metadata={}) {
    const userRecord = await this.adminApp.auth().getUser(uid);
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
        homeDomain: this.fqdn,
        ownerName: userRecord.displayName,
        ownerEmail: userRecord.email,
      },
    }
  }

  async createSession(data) {
    const sessionRef = await this
      .adminApp.firestore()
      .collection('domains')
      .doc(this.domainId)
      .collection('sessions')
      .add(data);

    return {
      //sessionId: sessionRef.id,
      sessionPath: '/pub/sessions/' + sessionRef.id,
    };
  }

  async registerHandle({fqdn, handle, uid, contactEmail, displayName}) {
    if (fqdn !== this.fqdn) throw new Error(
      `received fqdn ${fqdn} but this domain is ${this.fqdn}`);
    if (typeof handle !== 'string') throw new Error(
      `handle is required to register a handle`);
    if (typeof uid !== 'string') throw new Error(
      `uid is required to register a handle`);
    if (typeof contactEmail !== 'string') throw new Error(
      `contactEmail is required to register a handle`);
    if (typeof displayName !== 'string') throw new Error(
      `displayName is required to register a handle`);

    const userRecord = await this.adminApp.auth().getUser(uid);

    const db = this.adminApp.firestore();

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
    // const profileRef = domainRef.collection('profiles' ).doc();
    const handleRef  = domainRef.collection('handles'  ).doc(handle.toLowerCase());
    await db.runTransaction(async t => {

      const [existingUser, existingHandle] = await Promise
        .all([
          t.get(userRef),
          t.get(handleRef),
        ]);

      // TODO: check if user is allowed a new handle on this domain
      const handlesInDomain = (existingUser.get('profiles')||[])
        .filter(x => x.domain === this.domainId);
      console.log('existing profiles for', uid, 'are', handlesInDomain);
      if (handlesInDomain.length >= 1) return Promise.reject(new Error(
        `You already have too many profiles on this domain and cannot create more.`));

      console.log('existing handle for', handle, 'is', existingHandle.data());
      if (existingHandle.exists) return Promise.reject(new Error(
        `Handle "${handle}" is already taken on ${fqdn}`));

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
          .arrayUnion({domain: this.domainId, handle}),
      });

      t.set(configRef, {
        type: 'Library',
        name: `Application settings`,
        createdAt: new Date,
        policy: 'private-only',
        owner: {
          uid,
          domain: this.domainId,
          handle,
        },
      });
      t.set(dataRef, {
        type: 'Library',
        name: `Application data`,
        createdAt: new Date,
        policy: 'private-only',
        owner: {
          uid,
          domain: this.domainId,
          handle,
        },
      });
      t.set(publicRef, {
        type: 'Library',
        name: `Published by ~${handle}`,
        createdAt: new Date,
        policy: 'public-read',
        owner: {
          uid,
          domain: this.domainId,
          handle,
        },
      });

      t.set(handleRef, {
        handle,
        uid,
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
        ],
      });
    });

    // fill in any blanks on the UserRecord
    const userPromises = [];
    if (!userRecord.displayName) {
      userPromises.push(this.adminApp.auth()
        .updateUser(uid, {displayName}));
    }
    if (!userRecord.email) {
      userPromises.push(this.adminApp.auth()
        .updateUser(uid, {email: contactEmail}));
    }
    await Promise.all(userPromises).catch(err => console.warn(
      'Failed to update userRecord', userRecord, 'at registration time:', err));

    // return profileRef.id;
  }

  async getLibraryById(libraryId) {
    const db = this.adminApp.firestore();
    const profileDoc = await db
      .collection('libraries')
      .doc(libraryId)
      .get();
    if (!profileDoc.exists) throw new Error(
      `Profile ${profileId} not found`);
    return profileDoc.data();
  }

  async listHandlesForUser(uid) {
    const db = this.adminApp.firestore();
    const handleQuery = await db
      .collection('domains')
      .doc(this.domainId)
      .collection('handles')
      // .where('type', '==', 'identity')
      .where('uid', '==', uid)
      //.where('timestamp', '<=', 1509889854742) //Or something else
      .get();
    console.log('found handles', handleQuery.docs.map(x => x.get('handle')));
    return handleQuery.docs;
  }

  // async getProfileById(profileId) {
  //   const db = this.adminApp.firestore();
  //   const profileDoc = await db
  //     .collection('domains')
  //     .doc(this.domainId)
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

  spawnClientApp() {
    const firebaseConfig = require(join(configDir, `${this.credentialName}.json`));
    const app = firebase.initializeApp(firebaseConfig);
    app.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
    return app;
  }

  async logInUserPassword(email, password) {
    const clientApp = this.spawnClientApp();
    try {
      const {user} = await clientApp.auth()
        .signInWithEmailAndPassword(email, password);
      // const {user} = await clientApp.auth().signInWithEmailLink(email, password);
      const idToken = await user.getIdToken();
      console.log('logged in email as', idToken);
      return idToken;
    } finally {
      await clientApp.delete();
    }
  }

  async logInUserLink(email, link) {
    const clientApp = this.spawnClientApp();
    try {
      const {user} = await clientApp.auth()
        .signInWithEmailLink(email, link);
      const idToken = await user.getIdToken();
      console.log('logged in link as', idToken);
      return idToken;
    } finally {
      await clientApp.delete();
    }
  }

  async createAnonUser() {
    const clientApp = this.spawnClientApp();
    try {
      const {user} = await clientApp.auth().signInAnonymously();
      const idToken = await user.getIdToken();
      console.log('logged in anon as', idToken);
      return idToken;
    } finally {
      await clientApp.delete();
    }
  }

  async createCookie(idToken) {
    const maxAge = 5 * 24 * 60 * 60 * 1000;
    const cookieVal = await this.adminApp.auth()
      .createSessionCookie(idToken, {
        expiresIn: maxAge,
      });
    return {cookieVal, maxAge};
  }
};
