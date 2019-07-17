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

    const db = this.adminApp.firestore();

    // const existingProfile = await db
    //   .collection('profiles')
    //   // .doc(someRandomUserId)
    //   // .collection('feed')
    //   .where('uid', '==', uid)
    //   //.where('timestamp', '<=', 1509889854742) //Or something else
    //   .get();
    // console.log('existing profile for', uid, 'is', existingProfile);

    const domainRef = db
      .collection('domains')
      .doc(this.domainId);
    const userRef = db
      .collection('users')
      .doc(uid);

    const profileRef = domainRef
      .collection('profiles')
      .doc();
    const handleRef = domainRef
      .collection('handles')
      .doc(handle.toLowerCase());

    await db.runTransaction(async t => {

      // TODO: get/check if user is allowed a new handle on this domain

      const existingHandle = await t.get(handleRef);
      console.log('existing handle for', handle, 'is', existingHandle.data());
      if (existingHandle.exists) throw new Error(
        `Handle "${handle}" is already taken on ${fqdn}`);

      t.set(profileRef, {
        type: 'account',
        handle,
        uid,
        contactEmail,
        displayName,
        createdAt: new Date,
      });

      t.update(userRef, {
        profiles: admin.firestore.FieldValue
          .arrayUnion(`${this.domainId}:${profileRef.id}`),
      });

      t.set(handleRef, {
        handle,
        uid,
        contactEmail,
        displayName,
        createdAt: new Date,
      });

      // console.log('x', t.set(userRef, {
      //   [`handles.${this.domainId}`]: uid,
      // }, {merge: true}));
    });
    console.log('completed registration txn');

    // await this.adminApp.auth()
    //   .setCustomUserClaims(uid, {addr: [fqdn, handle]});

    return profileRef.id;
  }

  async listAccountProfilesForUser(uid) {
    const db = this.adminApp.firestore();
    const userDoc = await db
      .collection('domains')
      .doc(this.domainId)
      .collection('profiles')
      .where('type', '==', 'account')
      .where('uid', '==', uid)
      //.where('timestamp', '<=', 1509889854742) //Or something else
      .get();
    console.log('found profiles for', userDoc.docs.map(x => x.get('handle')));
    return userDoc.docs;
  }

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
