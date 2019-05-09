function matchPattern(input, pattern) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // excludes * and ?
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.?');
  return new RegExp(`^${regex}$`).test(input);
}

GraphEngine.attachBehavior('http-server/v1-beta1', 'Handler', {

  async handle(request) {
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
        return otherHandler.handle(request);
      }
    }

    switch (this.DefaultAction.currentKey) {

      case 'FixedResponse':
        const {StatusCode, Body, Headers} = this.DefaultAction.FixedResponse;
        return await request.RETURNED.newResponse({
          Timestamp: new Date,
          Status: { Code: StatusCode },
          Headers, Body,
        });

      case 'Reference':
        console.log('the ref', await this.DefaultAction.Reference);
        throw new Error('TODO')

      default:
        throw new Error(`unhandled http-server/Handler.Action ${this.DefaultAction.currentKey}`);
    }
  },

});
