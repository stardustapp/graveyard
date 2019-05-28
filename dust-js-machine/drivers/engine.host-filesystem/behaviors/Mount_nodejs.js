const {readdir, stat} = require('fs').promises;
const {extname, join, normalize, resolve, sep} = require('path');

const BYTES_RANGE_REGEXP = /^ *bytes=/;
const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year
const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

const FILE_TYPE_KEYS = 'Directory File Socket FIFO SymbolicLink BlockDevice CharacterDevice'.split(' ');

CURRENT_LOADER.attachBehavior(class Mount {

  async setup() {
    console.log('setting up')
    if (this.Anchor.currentKey !== 'HostPath') throw new Error(
      `NodeJS filesystem can only load HostPath anchors`);
    this.rootPath = resolve(this.Anchor.HostPath);
    this.Root.Meta = await this.readMeta('.');
    this.Root.Mount = this;

    this.metaCache = new AsyncCache({loadFunc: this.readMeta.bind(this)});
    this.entryCache = new AsyncCache({loadFunc: this.readEntry.bind(this)});
      console.log('done setup')
  }

  async getEntry(subPath, expectType=null) {
    const entry = await this.entryCache.get(subPath);
    const {FileType} = entry.Meta[entry.Meta.currentKey];
    if (!FileType) throw new Error(
      `didn't find FileType on Entry for ${subPath}`);
    if (expectType !== null && FileType !== expectType) throw new Error(
      `Mount#getEntry() called expecting ${expectType}, but found ${FileType}`);
    return entry;
  }

  async listChildren(path) {
    const realPath = this.resolvePath(path);
    console.log('readdir "%s"', realPath);
    const entries = await readdir(realPath, {
      withFileTypes: true,
    });
    return entries.map(x => ({
      name: x.name,
      isFile: x.isFile(),
      isDirectory: x.isDirectory(),
    }));
  }

  async readEntry(subPath) {
    const Meta = await this.metaCache.get(subPath);
    if (Meta.Code) {
      if (Meta.Code === 'ENOENT') return null;
      throw new Error(
        `host-filesystem/Mount.getEntry() encountered ${Meta.Code}`);
    }

    const {FileType} = Meta[Object.keys(Meta)[0]]; // TODO: currentKey
    if (!FileType) throw new Error(
      `didn't find FileType for ${subPath}`);

    return await this.getGraphCtx().newTypedFields(FileType, {
      Path: normalize(subPath),
      Meta,
      Mount: this,
    });
  }
  async readMeta(path) {
    const realPath = this.resolvePath(path);
    console.log('stat "%s"', realPath);
    try {
      const stats = await stat(realPath);
      return { Posix: {
        FileType: FILE_TYPE_KEYS.find(type => stats[`is${type}`]()),

        Device: stats.dev,
        Inode: stats.ino,
        Mode: stats.mode,
        NumLinks: stats.nlink,
        UserId: stats.uid,
        GroupId: stats.gid,
        SpecialDevice: stats.rdev,
        ByteSize: stats.size,
        BlockSize: stats.blksize,
        Blocks: stats.blocks,

        AccessTime: stats.atime,
        ModifyTime: stats.mtime,
        ChangeTime: stats.ctime,
        BirthTime: stats.birthtime,
      }};
    } catch (err) {
      if (typeof err.code === 'string' && err.code.length > 0) {
        console.log('stat errcode "%s"', err.code, err.message);
        return { Code: err.code };
      } else {
        console.log('stat err\n', err.stack);
        throw err;
      }
    }
  }

  resolvePath(subPath, sliceDepth=0) {
    // normalize
    const path = normalize('.' + sep + subPath);

    // malicious path
    if (UP_PATH_REGEXP.test(path)) {
      console.log('malicious path "%s"', path)
      throw new HttpBodyThrowable(403, `malicious path`);
    }

    // explode path parts
    const parts = path.split(sep).slice(sliceDepth);

    // join / normalize from root dir
    const rootPath = resolve(this.Anchor.HostPath);
    return normalize(join(rootPath, parts.join(sep)));
  }

});
