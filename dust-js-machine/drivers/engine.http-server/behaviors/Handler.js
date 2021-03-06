function matchPattern(input, pattern) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // excludes * and ?
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.?');
  return new RegExp(`^${regex}$`).test(input);
}

CURRENT_LOADER.attachBehavior(class Handler {

  async handle(request, graphWorld, tags) {
    // console.log('handling request', request, 'with', this);
    // console.log('root handler', this.exportData());

    for (const rule of this.InnerRules) {
      let ruleMatches = true;
      for (const condition of rule.Conditions) {
        switch (condition.currentKey) {

          case 'Host':
            if (!condition.Host.Names.some(pattern => matchPattern(request.HostName, pattern)))
              ruleMatches = false;
            break;

          case 'PathPatterns':
            if (!condition.PathPatterns.some(pattern => matchPattern(request.Path, pattern)))
              ruleMatches = false;
            break;

          default:
            throw new Error(`unhandled http-server/Handler.Condition ${condition.currentKey}`);
        }
        if (!ruleMatches) break;
      }

      if (ruleMatches) {
        // TODO: any rerouting or rewriting?
        console.log('forwarding request to other handler')
        const otherHandler = await rule.ForwardTo;
        return otherHandler.handle(request, graphWorld, tags);
      }
    }

    const response = await this.performAction(request, graphWorld);
    if (response) {
      response.Headers.push({
        Key: 'X-Dust-Listener',
        Value: tags.listener,
      },{
        Key: 'X-Dust-Handler-ID',
        Value: this.nodeId,
      });
    }
    tags.action_type = this.DefaultAction.currentKey;
    return response;
  }

  async performAction(request, graphWorld) {
    //if (!graphWorld) throw new Error(`no graphWorld`);
    switch (this.DefaultAction.currentKey) {

      case 'FixedResponse':
        request.assertNormalRequest();
        const {StatusCode, Body, Headers} = this.DefaultAction.FixedResponse;
        return await request.RETURNED.newResponse({
          Timestamp: new Date,
          Status: { Code: StatusCode },
          Headers, Body,
        });

      case 'ForeignNode':
        const {Ref, Behavior, Input, AllowUpgrades} = await this.DefaultAction.ForeignNode;
        const target = await Ref;

        if (!AllowUpgrades) request.assertNormalRequest(); // TODO: actually check allowed list
        if (!target || typeof target[Behavior] !== 'function') throw new Error(
          `http-server/Handler.ForeignNode failed to resolve to a behavior`);

        const response = await target[Behavior](graphWorld, request, Input);
        if (!response || !response.Headers) throw new Error(
          `ForeignNode behavior didn't return a good response`);
        return response;

      case 'StreamFiles':
        await this.DefaultAction.StreamFiles.RootDir;
        return streamFile(request, this.DefaultAction.StreamFiles);

      default:
        throw new Error(`unhandled http-server/Handler.Action ${this.DefaultAction.currentKey}`);
    }
  }

});

async function selectFileToStream(request, {
  PathDepth, RootDir, DotFiles, Extensions, IndexFiles,
  AcceptRanges, CacheControl, ETag, Immutable, LastModified, MaxAge,
}) {
  // decode the path
  var path = decodeURIComponent(request
    .Path.slice(1).split('/').slice(PathDepth).join('/'));

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
  if (request.hasTrailingSlash()) {
    const folder = await RootDir.getDirectory(path);
    for (const indexFile of IndexFiles) {
      const entry = await folder.getFile(indexFile);
      if (entry) return entry;
    }

    let childNames = await folder.readChildNames();
    // TODO: optionally filter dotfiles out of childNames
    const html = commonTags.safeHtml`
      <!doctype html>
      <title>${folder.baseName()}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style type="text/css">
        body { background-color: #ddd; }
        footer { color: #333; }
        footer p { margin: 0; }
      </style>
      <h1>${folder.baseName()}/</h1>
      <p><a href="..">Navigate up</a></p>
      <hr>
      <ul>
      `+`\n  `+childNames.map(c => {
        const dirChar = c.isDirectory ? '/' : '';
        return commonTags.safeHtml`
        <li><a href="${c.name}${dirChar}">${c.name}</a>${dirChar}</li>
      `}).join('\n  ')+`\n`+commonTags.safeHtml`</ul>
      <hr>
      <footer>
        <p>Generated by <a href="${HTTP_SERVER_SOURCE}">${HTTP_SERVER_HEADER}</a></p>
        <p>Served as ${request.HostName}</p>
        <p>Powered by the Stardust platform</p>
      </footer>`;
    throw new HttpBodyThrowable(200, html, {
      'Content-Type': 'text/html; charset=UTF-8',
    });
  }

  const entry = await RootDir.getEntry(path);
  if (!entry)
    throw new HttpBodyThrowable(404, 'not found');

  switch (entry.Meta.Posix.FileType) {
    case 'File':
      return entry;
    case 'Directory':
      throw request.makeSlashRedirectThrowable();
  }
}

async function streamFile(request, configuration) {
  request.assertNormalRequest();
  if (!['GET', 'HEAD'].includes(request.Method))
    throw new HttpBodyThrowable(405,
      `Method Not Allowed - must be GET or HEAD`, {
        'Allow': 'GET, HEAD',
      });

  const entry = await selectFileToStream(request, configuration);
  //console.log('streaming', path, entry);

  const stream = await entry.createReadStream();
  // Actually make sure the file can be read
  try {
    await new Promise((resolve, reject) => {
      stream.once('readable', resolve);
      stream.once('error', reject);
    });
  } catch (err) {
    console.log('http encountered new error reporting stream error', err.stack);
    return request.makeJsonResponse({error: err.name, message: err.message}, 500);
  }

  const response = await request.makeNodeJsStreamingResponse(stream);
  response.setHeader('Content-Type', entry.guessMime());
  return response;
}
