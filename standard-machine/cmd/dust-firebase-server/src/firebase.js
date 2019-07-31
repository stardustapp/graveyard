const fs = require('fs');
const os = require('os');
const process = require('process');
const {join, basename, extname} = require('path');

const topDir = process.env.DUST_CONFIG_DIR
  || join(os.homedir(), '.config', 'dust-firebase-server');
const credDir = join(topDir, 'credentials');
const configDir = join(topDir, 'configs');

const availCreds = fs.readdirSync(credDir).filter(x => extname(x) === '.json');
console.log('Available Firebase credentials:', availCreds);
if (availCreds.length !== 1) throw new Error(
  `TODO: found non-1 amount of Firebase credentials`);
exports.mainCredName = basename(availCreds[0], '.json');

/////////////////////////

const firebase = require('firebase');
const admin = require("firebase-admin");

const {FirestoreDomain} = require('./firestore-domain.js');
const {FirestoreLibrary} = require('./firestore-library.js');
const {CreateMapCache, FirestoreMap} = require('./firestore-map.js');

const {AsyncCache} = require('@dustjs/standard-machine-rt');

exports.FireContext = class FireContext {
  constructor(credentialName) {
    this.credentialName = credentialName;

    const serviceAccount = require(join(credDir, credentialName+'.json'));
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

    this.domainCache = new AsyncCache({
      loadFunc: this.loadDomain.bind(this),
    });
  }

  // Domains

  async bootstrap() {
    let localhost = await this.selectDomain('localhost');
    if (!localhost) {
      await this.createDomain('localhost', {system: true});
    }
  }

  selectDomain(fqdn) {
    return this.domainCache.get(fqdn);
  }
  async loadDomain(fqdn) {
    const domainSnap = await this
      .adminApp.firestore()
      .collection('domains')
      .where('fqdns', 'array-contains', fqdn)
      .get();

    if (domainSnap.empty) {
      return null;
    } else if (domainSnap.size > 1) {
      throw new Error(`BUG: FQDN '${fqdn}' matches multiple domain records`);
    } else if (domainSnap.docs[0].id !== fqdn) {
      // alt name - get by main name
      return this.domainCache.get(domainSnap.docs[0].id);
    }

    // direct name, load it up
    const domainRef = this
      .adminApp.firestore()
      .collection('domains')
      .doc(fqdn);

    const domain = new FirestoreDomain(this, fqdn, domainRef);
    await domain.bootstrap();
    return domain;
  }

  async createDomain(fqdn, owner) {
    // const libOwner = // TODO
    await this
      .adminApp.firestore()
      .collection('domains')
      .doc(fqdn)
      .create({
        type: 'WebDomain',
        fqdns: [fqdn],
        createdAt: new Date,
        access: ['owned'],
        owner,
        devices: [{
          libraryId: await this.createTreeLibrary(`Published by ${fqdn}`, libOwner, ['owned']),
          path: '/public',
          type: 'Library',
        }],
      });
  }

  // Libraries

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

  async createTreeLibrary(name, owner, access) {
    return await this
      .adminApp.firestore()
      .collection('libraries')
      .add({
        type: 'TreeLibrary',
        createdAt: new Date,
        name, owner, access,
      });
  }

  // Users

  async markUserSeen(uid) {
    await this
      .adminApp.firestore()
      .collection('users')
      .doc(uid)
      .set({
        lastSeen: new Date,
      }, {merge: true});
  }

  async makeCSRF(uid, origin) {
    const createdAt = new Date;
    const csrfDoc = await this
      .adminApp.firestore()
      .collection('users')
      .doc(uid)
      .collection('csrfs')
      .add({ createdAt, origin });
    return csrfDoc.id;
  }

  async checkCSRF(csrf, uid, origin) {
    if (!csrf) throw new Error(
      `The form you submitted is missing a security token. Maybe you clicked a bad link?`);

    const csrfDoc = await this
      .adminApp.firestore()
      .collection('users')
      .doc(uid)
      .collection('csrfs')
      .doc(csrf)
      .get();

    if (!csrfDoc.exists) throw new Error(
      `The form's security token could not be found. Maybe you clicked a bad link?`);
    if (csrfDoc.get('origin') !== origin) throw new Error(
      `The form's security token is for a different URL origin. Maybe you clicked a bad link?`);
    const oldestOk = new Date - (60 * 60 * 1000); // 1 hour
    if (csrfDoc.get('createdAt') < oldestOk) throw new Error(
      `The form's security token has expired. Please try re-submitting.`);
  }

  getUserProfile(uid) {
    return this.adminApp.auth().getUser(uid);
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
  readCookie(sessionCookie) {
    return this.adminApp.auth()
      .verifySessionCookie(sessionCookie, false /* checkRevoked */)
  }
};
