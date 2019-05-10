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
    response.Headers.push({
      Key: 'X-Dust-Listener-ID',
      Value: tags.listener_id,
    },{
      Key: 'X-Dust-Handler-ID',
      Value: this.nodeId,
    });
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

      default:
        throw new Error(`unhandled http-server/Handler.Action ${this.DefaultAction.currentKey}`);
    }
  },

});
