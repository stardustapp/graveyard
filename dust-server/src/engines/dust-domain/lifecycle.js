const extensions = GraphEngine.extend('dust-domain/v1-beta1');
extensions.lifecycle = {

  async buildNew(graphCtx, {fields}) {
    return await graphCtx.newTopNode({
      DomainName: fields.domain,
    });
  },

};
