const {
  AsyncCache, Channel,
  EnumerationWriter,
} = require('@dustjs/standard-machine-rt');
const commonTags = require('common-tags');

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
  constructor(context) {
    this.context = context;
    this.env = new Environment;
  }
  getEntry(path) {
    return this.env.getEntry(path);
  }

  async loadFromRef(reference) {
    this.rootRef = reference;

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
        `Map '${reference.path}' not found, cannot load`);

      console.log('loading', firstSnap.type, 'map');
      await this.applyData(firstSnap);

      snapChannel.forEach(snapshot => {
        return this.applyData(snapshot);
      });

      if (typeof this.bootstrap === 'function')
        await this.bootstrap();

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
      this.snapshot = newData;
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
          deviceInst = new FirestoreLibrary(this.context
            .adminApp.firestore()
            .collection('libraries')
            .doc(deviceConf.libraryId), uid);
          // deviceInst = await loadMount(this.domain, deviceConf.target, uid)
          break;

        case 'Handle':
          if (!this.context) throw new Error(
            `Can't mount Handle without a Context`);
          if (this.domainId && (this.domainId !== deviceConf.domainId)) throw new Error(
            `Can't mount Handle from different Domain`);
          const domain = await this.context.domainCache.get(deviceConf.domainId);
          const handle = await domain.handleCache.get(deviceConf.handleId);
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
    this.snapshot = newData;
  }

  async findWebEntry(ctx, mountPath='', prefix='/public/web') {
    const {path, search} = ctx.request;

    // If it's a directory, try filling entry with index.html
    if (path.endsWith('/')) {
      const indexEntry = await this.getEntry(prefix + path + 'index.html');
      if (indexEntry && indexEntry.get) {
        const index = await indexEntry.get();
        if (index) return index;
      }
    }

    // just get it directly
    const entry = await this.getEntry(prefix + path);
    if (!entry || (!entry.get && !entry.invoke))
      return null;

    const target = await entry.get();
    // target = await entry.invoke(new StringLiteral('request', JSON.stringify(req)));
    if (!target) return null;

    // Maybe it's a directory instead of a file
    if (target.Type === 'Folder' && entry.enumerate) {
      if (!path.endsWith('/')) {
        return ctx.redirect(mountPath+path+'/'+search);
      }

      const enumer = new EnumerationWriter(1);
      await entry.enumerate(enumer);
      const children = enumer.toOutput().Children.filter(x => x.Name);
      console.log('enumer.output', children);

      const pkgMeta = require('../package.json');
      const cleanPkgName = pkgMeta.name.replace('@','').replace('/','-');

      const html = commonTags.safeHtml`<!doctype html>
        <title>${path}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">
          body { background-color: #ddd; }
          footer { color: #333; }
          footer p { margin: 0; }
        </style>
        <h1>${path}</h1>
        <p><a href="..">Navigate up</a></p>
        <hr>
        <ul>
        `+`\n  `+(children.map(c => {
          const dirChar = c.Type === 'Folder' ? '/' : '';
          return commonTags.safeHtml`
          <li><a href="${c.Name}${dirChar}">${c.Name}</a>${dirChar}</li>
        `}).join('\n  ')||`
          <li class="empty">directory is empty</li>
        `)+`\n`+commonTags.safeHtml`</ul>
        <hr>
        <footer>
          <p>Generated by <a href="${pkgMeta.homepage}">${cleanPkgName}/${pkgMeta.version}</a></p>
          <p>Served as ${ctx.request.origin}</p>
          <p>Powered by the Stardust platform</p>
        </footer>`;
      return  {
        Type: 'Blob',
        Data: Buffer.from(html, 'utf-8').toString('base64'),
        Mime: 'text/html; charset=utf-8',
      };
    }

    return target;
  }
}
