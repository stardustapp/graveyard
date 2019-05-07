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

          default:
            throw new Error(`unhandled http-server/Handler.Condition`);
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

      default:
        throw new Error(`unhandled http-server/Handler.Action`);
    }
  },

});
