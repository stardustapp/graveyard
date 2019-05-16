function matchPattern(input, pattern) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // excludes * and ?
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.?');
  return new RegExp(`^${regex}$`).test(input);
}

GraphEngine.attachBehavior('http-server/v1-beta1', 'Handler', {

  async handle(request, graphWorld, tags) {
    //console.log('handling request', request);

    for (const rule of this.InnerRules) {
      let ruleMatches = true;
      for (const condition of rule.Conditions) {
        switch (condition.currentKey) {

          case 'Host':
            if (!condition.Host.Names.includes(request.HostName))
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
        Key: 'X-Dust-Listener-ID',
        Value: tags.listener_id,
      },{
        Key: 'X-Dust-Handler-ID',
        Value: this.nodeId,
      });
    }
    tags.action_type = this.DefaultAction.currentKey;
    return response;
  },

  async performAction(request, graphWorld) {
    if (!graphWorld) throw new Error(`no graphWorld`);
    switch (this.DefaultAction.currentKey) {

      case 'FixedResponse':
        const {StatusCode, Body, Headers} = this.DefaultAction.FixedResponse;
        return await request.RETURNED.newResponse({
          Timestamp: new Date,
          Status: { Code: StatusCode },
          Headers, Body,
        });

      case 'ForeignNode':
        const {Ref, Behavior, Input} = await this.DefaultAction.ForeignNode;
        const target = await Ref;
        if (!target || typeof target[Behavior] !== 'function') throw new Error(
          `http-server/Handler.ForeignNode failed to resolve to a behavior`);
        const response = await target[Behavior](graphWorld, request, Input);
        if (!response || !response.Headers) throw new Error(
          `ForeignNode behavior didn't return a good response`);
        return response;

      case 'StreamFiles':
        await this.DefaultAction.StreamFiles.RootDir;
        return streamFile(this.DefaultAction.StreamFiles, request);

      default:
        throw new Error(`unhandled http-server/Handler.Action ${this.DefaultAction.currentKey}`);
    }
  },

});

async function streamFile({
  PathDepth, RootDir, DotFiles, Extensions, IndexFiles,
  AcceptRanges, CacheControl, ETag, Immutable, LastModified, MaxAge,
}, request) {

  if (!['GET', 'HEAD'].includes(request.Method))
    throw new HttpBodyThrowable(405,
      `Method Not Allowed - must be GET or HEAD`);

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
  if (IndexFiles.length && request.hasTrailingSlash()) {
    throw new Error(`TODO trailing slash`);
    return this.sendIndex(path, request);
  }

  const entry = await RootDir.getEntry(path, 'File');
  if (!entry) return request.makePlaintextResponse('file not found', 404);

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
