GraphEngine.attachBehavior('dust-app/v1-beta1', 'RecordSchema', {

  // walk schema back to BuiltIns, in reverse order
  getSchemaStack() {
    const stack = [this];
    let cursor = this;
    while (cursor.Base.SchemaRef) {
      cursor = self.gs.objects.get(cursor.Base.SchemaRef);
      stack.unshift(cursor);
    }
    return stack;
  },

  // list off all direct child schemas
  getChildSchemas() {
    return self.gs
      .graphs.get(this.data.graphId)
      .selectAllWithType('RecordSchema')
      .filter(x => x.Base.SchemaRef == this.data.objectId);
  },

  // list self and any children types, recursively
  getPossibleTypes() {
    const seenTypes = new Set;
    function process(obj) {
      seenTypes.add(obj);
      for (const child of obj.getChildSchemas()) {
        if (seenTypes.has(child)) continue;
        // we know Base.key is SchemaRef
        process(child);
      }
    }
    process(this);
    return Array.from(seenTypes);
  },

});
