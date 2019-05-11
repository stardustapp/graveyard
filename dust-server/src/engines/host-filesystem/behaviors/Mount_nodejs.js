const fs = require('fs');
const {promisify} = require('util');
const fsStat = promisify(fs.stat);
const {extname, join, normalize, resolve, sep} = require('path');

const BYTES_RANGE_REGEXP = /^ *bytes=/;
const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year
const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

const FILE_TYPE_KEYS = 'Directory File Socket FIFO SymbolicLink BlockDevice CharacterDevice'.split(' ');

GraphEngine.attachBehavior('host-filesystem/v1-beta1', 'Mount', {

  async activate() {
    if (this.Anchor.currentKey !== 'HostPath') throw new Error(
      `NodeJS filesystem can only load HostPath anchors`);
    this.rootPath = resolve(this.Anchor.HostPath);
    this.Root.Meta = await this.readMeta('.');
    this.Root.Mount = this;
  },

  async getEntry(subPath, expectType=null) {
    const Meta = await this.readMeta(subPath);
    if (Meta.Code) {
      if (Meta.Code === 'ENOENT') return null;
      throw new Error(
        `host-filesystem/Mount.getEntry() encountered ${Meta.Code}`);
    }

    const {FileType} = Meta[Object.keys(Meta)[0]]; // TODO: currentKey
    if (!FileType) throw new Error(
      `didn't find FileType for ${subPath}`);
    if (expectType !== null && FileType !== expectType) throw new Error(
      `Mount#getEntry() called expecting ${expectType}, but found ${FileType}`);

    return await this.getGraphCtx().newTypedFields(FileType, {
      Path: normalize(subPath),
      Meta,
      Mount: this,
    });
  },

  async readMeta(path) {
    console.log('stat "%s"', this.resolvePath(path));
    try {
      const stats = await fsStat(this.resolvePath(path));
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
  },

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
  },

  sendFile (path) {
    var i = 0;

    console.log('stat "%s"', path)
    fs.stat(path, function onstat (err, stat) {
      if (err && err.code === 'ENOENT' && !extname(path) && path[path.length - 1] !== sep) {
        // not found, check extensions
        return next(err)
      }
      if (err) return self.onStatError(err)
      if (stat.isDirectory()) return self.redirect(path)
      self.emit('file', path, stat)
      self.send(path, stat)
    })

    function next (err) {
      if (self._extensions.length <= i) {
        return err
          ? self.onStatError(err)
          : self.error(404)
      }

      var p = path + '.' + self._extensions[i++]

      console.log('stat "%s"', p)
      fs.stat(p, function (err, stat) {
        if (err) return next(err)
        if (stat.isDirectory()) return next()
        self.emit('file', p, stat)
        self.send(p, stat)
      })
    }
  },

});
