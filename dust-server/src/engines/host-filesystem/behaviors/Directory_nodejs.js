const fs = require('fs');
const {promisify} = require('util');
const fsStat = promisify(fs.stat);
const {extname, join, normalize, resolve, sep} = require('path');

const BYTES_RANGE_REGEXP = /^ *bytes=/;
const MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000; // 1 year
const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

GraphEngine.attachBehavior('host-filesystem/v1-beta1', 'Directory', {

  getDirectory(path) {
    return this.Mount.getEntry(join(this.Path, path), 'Directory');
  },
  getFile(path) {
    return this.Mount.getEntry(join(this.Path, path), 'File');
  },
  getEntry(path) {
    return this.Mount.getEntry(join(this.Path, path));
  },

  async readMeta(path) {
    console.log('stat "%s"', this.resolvePath(path));
    try {
      const stats = await fsStat(this.resolvePath(path));
      return { Posix: {
        Device: stats.dev,
        Inode: stats.ino,
        Mode: stats.mode,
        NumLinks: stats.nlink,
        UserId: stats.uid,
        GroupId: stats.gid,
        ByteSize: stats.size,
        BlockSize: stats.blksize,
        Blocks: stats.blocks,

        AccessTime: stats.atime,
        ModifyTime: stats.mtime,
        ChangeTime: stats.ctime,
        BirthTime: stats.birthtime,
      }};
    } catch (err) {
      console.log('stat err "%s"', err.code);
      if (err && err.code === 'ENOENT')
        return { Missing: true };
      throw err;
    }
  },

  resolvePath(path, sliceDepth=0) {
    //if (this.rootPath !== null) {
    //const rootPath = resolve(this.Root.HostPath);

    // normalize
    if (path) {
      path = normalize('.' + sep + path);
    }

    // malicious path
    if (UP_PATH_REGEXP.test(path)) {
      console.log('malicious path "%s"', path)
      throw new HttpBodyThrowable(403, `malicious path`);
    }

    // explode path parts
    const parts = path.split(sep).slice(sliceDepth);

    // join / normalize from optional root dir
    return normalize(join(this.rootPath, parts.join(sep)));

    // } else {
    //   // ".." is malicious without "root"
    //   if (UP_PATH_REGEXP.test(path)) {
    //     console.log('malicious path "%s"', path)
    //     this.error(403)
    //     return res
    //   }
    //
    //   // explode path parts
    //   parts = normalize(path).split(sep)
    //
    //   // resolve the path
    //   path = resolve(path)
    // }
  },

  async serveStaticReq(graphWorld, request, {
    PathDepth = 0,
  }={}) {
    if (!['GET', 'HEAD'].includes(request.Method))
      throw new HttpBodyThrowable(405,
        `Method Not Allowed - must be GET or HEAD`);

    // decode the path
    var path = decodeURIComponent(request.Path);

    // null byte(s)
    if (~path.indexOf('\0'))
      throw new HttpBodyThrowable(400, `null bytes in path`);

    // dotfile handling
    // if (containsDotFile(parts)) {
    //   var access = this._dotfiles
    //
    //   // legacy support
    //   if (access === undefined) {
    //     access = parts[parts.length - 1][0] === '.'
    //       ? (this._hidden ? 'allow' : 'ignore')
    //       : 'allow'
    //   }
    //
    //   console.log('%s dotfile "%s"', access, path)
    //   switch (access) {
    //     case 'allow':
    //       break
    //     case 'deny':
    //       this.error(403)
    //       return res
    //     case 'ignore':
    //     default:
    //       this.error(404)
    //       return res
    //   }
    // }

    // index file support
    if (this.IndexFiles.length && request.hasTrailingSlash()) {
      return this.sendIndex(path, request);
    }

    return this.sendFile(path, request);
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
