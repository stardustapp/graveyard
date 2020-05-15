const fs = require('fs');
const path = require('path');

CURRENT_LOADER.attachBehavior(class File {

  createReadStream(opts) {
    const path = this.Mount.resolvePath(this.Path);
    return fs.createReadStream(path, opts);
  }
  readAll(opts) {
    const path = this.Mount.resolvePath(this.Path);
    return fs.promises.readFile(path, opts);
  }

  guessMime() {
    const ext = path.extname(this.Path);
    if (ext in ExtensionMimes)
      return ExtensionMimes[ext];
    return 'application/octet-stream';
  }

  baseName() {
    return path.basename(this.Path);
  }

});

// web-oriented subset of https://github.com/stardustapp/dust-server/blob/59dba97cc466c54c2c16e3137652d5951ceafd8e/vendor/libraries/wsc-chrome.js#L4698-L5681
// plus wasm
// TODO: use https://cdn.jsdelivr.net/gh/jshttp/mime-db@master/db.json
// TODO: or use https://github.com/lukaszsliwa/friendly_mime/blob/master/mimes.csv for names
var ExtensionMimes = {
  ".3g2": "video/3gpp2",
  ".3gp": "video/3gpp",
  ".7z": "application/x-7z-compressed",
  ".ai": "application/postscript",
  ".aif": "audio/x-aiff",
  ".aifc": "audio/x-aiff",
  ".aiff": "audio/x-aiff",
  ".apk": "application/vnd.android.package-archive",
  ".atom": "application/atom+xml",
  ".au": "audio/basic",
  ".avi": "video/x-msvideo",
  ".bin": "application/octet-stream",
  ".bmp": "image/bmp",
  ".bz": "application/x-bzip",
  ".bz2": "application/x-bzip2",
  ".conf": "text/plain",
  ".crl": "application/pkix-crl",
  ".crt": "application/x-x509-ca-cert",
  ".css": "text/css",
  ".csv": "text/csv",
  ".dmg": "application/x-apple-diskimage",
  ".dump": "application/octet-stream",
  ".h261": "video/h261",
  ".h263": "video/h263",
  ".h264": "video/h264",
  ".htm": "text/html",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".in": "text/plain",
  ".jar": "application/java-archive",
  ".java": "text/x-java-source",
  ".jnlp": "application/x-java-jnlp-file",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript",
  ".json": "application/json",
  ".log": "text/plain",
  ".m3a": "audio/mpeg",
  ".m3u": "audio/x-mpegurl",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".m4u": "video/vnd.mpegurl",
  ".m4v": "video/x-m4v",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".mime": "message/rfc822",
  ".mk3d": "video/x-matroska",
  ".mka": "audio/x-matroska",
  ".mks": "video/x-matroska",
  ".mkv": "video/x-matroska",
  ".mobi": "application/x-mobipocket-ebook",
  ".mov": "video/quicktime",
  ".movie": "video/x-sgi-movie",
  ".mp2": "audio/mpeg",
  ".mp21": "application/mp21",
  ".mp2a": "audio/mpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".mp4a": "audio/mp4",
  ".mp4s": "application/mp4",
  ".mp4v": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
  ".mpg4": "video/mp4",
  ".mpga": "audio/mpeg",
  ".nfo": "text/x-nfo",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".ogv": "video/ogg",
  ".ogx": "application/ogg",
  ".pdf": "application/pdf",
  ".pgp": "application/pgp-encrypted",
  ".png": "image/png",
  ".spx": "audio/ogg",
  ".svg": "image/svg+xml",
  ".svgz": "image/svg+xml",
  ".swf": "application/x-shockwave-flash",
  ".text": "text/plain",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".torrent": "application/x-bittorrent",
  ".txt": "text/plain",
  ".unityweb": "application/vnd.unity",
  ".uu": "text/x-uuencode",
  ".vcard": "text/vcard",
  ".wasm": "application/wasm",
  ".wav": "audio/x-wav",
  ".weba": "audio/webm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xhtml": "application/xhtml+xml",
  ".xml": "application/xml",
  ".xslt": "application/xslt+xml",
  ".xz": "application/x-xz",
  ".zip": "application/zip",
};
