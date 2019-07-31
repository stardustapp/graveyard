const {AsyncCache, Channel} = require('@dustjs/standard-machine-rt');

const {FirestoreLibrary} = require('./firestore-library.js');

exports.CreateMapCache = function({refDoc, constr}) {
  return new AsyncCache({
    loadFunc: async input => {
      const map = constr(input);
      await map.loadFromRef(refDoc(input));
      return map;
    },
  });
}

exports.FirestoreMap = class FirestoreMap {
  constructor(domain) {
    this.domain = domain;
    this.env = new Environment;
  }
  getEntry(path) {
    return this.env.getEntry(path);
  }

  async loadFromRef(reference) {
    const snapChannel = new Channel('firemap');
    let stopFunc, firstSnap;
    firstSnap = await new Promise((resolve, reject) => {
      stopFunc = reference.onSnapshot(snapshot => {
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

      console.log('loading', firstSnap.type, 'map');
      await this.applyData(firstSnap);

      snapChannel.forEach(snapshot => {
        return this.applyData(snapshot);
      });

    } catch (err) {
      stopFunc();
      console.log('loading map FAILED');
      throw err;
    }
  }

  async applyData(newData=null) {
    if (!newData) {
      console.error('WARN: running session', this.handle, 'was deleted');
      this.env = new Environment;
      return;
    }

    const newEnv = new Environment;
    const {metadata, expiresAt, type, uid, devices} = newData;

    if (expiresAt && (expiresAt < new Date)) throw new Error(
      `This map has expired, cannot load`);

    for (const key in metadata) {
      if (metadata[key] === null) continue;
      const name = key.replace(/[a-z][A-Z]+/g, (x => x[0]+' '+(x.length>2 ? x.slice(1) : x[1].toLowerCase())));
      newEnv.mount('/metadata/'+encodeURIComponent(name), 'literal', {
        string: metadata[key].toString(),
      });
    }

    for (const deviceConf of devices) {
      const name = deviceConf.path.split('/').slice(-1)[0];
      let deviceInst;
      switch (deviceConf.type) {

        case 'Library':
          deviceInst = new FirestoreLibrary(this.domain.context
            .adminApp.firestore()
            .collection('libraries')
            .doc(deviceConf.libraryId), uid);
          // deviceInst = await loadMount(this.domain, deviceConf.target, uid)
          break;

        case 'Handle':
          if (!this.domain) throw new Error(
            `Can't mount Handle without a Domain`);
          if (this.domain.domainId !== deviceConf.domainId) throw new Error(
            `Can't mount Handle from different Domain`);
          const handle = await this.domain.handleCache.get(deviceConf.handleId);
          deviceInst = handle;
          break;

        case 'String':
          // const inner = new StringLiteral(name, deviceConf.value);
          deviceInst = { getEntry(path) {
            if (path.length > 1) return null;
            return { get() {
              return {Type: 'String', StringValue: deviceConf.value};
            }};
          }};
          break;
        default:
          console.log('unknown device', deviceConf);
          throw new Error(`Can't bind unknown device ${deviceConf.type}`);
      }
      newEnv.bind(deviceConf.path, deviceInst)
    }

    this.env = newEnv;
  }
}
