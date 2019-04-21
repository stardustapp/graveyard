GraphEngine.attachBehavior('dust-app/v1-beta1', 'Publication', {

  getRecordFilter(rootPublication=this) {
    // empty specs mean every type
    const sourceSpec = {};

    // but some subs are specific so
    if (this.RecordType.SchemaRef) {
      const schemaObj = self.gs.objects.get(this.RecordType.SchemaRef);
      sourceSpec.types = schemaObj
        .getPossibleTypes()
        .map(x => x.data.name);
    }

    // build the filter
    const filterBy = JSON.parse(this.FilterBy);
    const filter = new RecordFilter({
      sourceSpec,
      filterFunc: this.FilterBy.length > 2
        ? (doc, refs) => {
          for (const key of Object.keys(filterBy)) {
            const val = filterBy[key];
            if (val && '$param' in val) {
              //console.log('param diff', key, '-', doc[key], refs.param[val.$param]);
              return doc[key] === refs.param[val.$param];
            } else if (val && '$parent' in val) {
              console.warn(key, val, doc);
              if (val.$field && val.$field.includes('[].')) throw new Error(
                `TODO: $parent's $field in FilterBy is complex`);
                //filterBy[key] = if val.$field?.includes '[].'
                //  [ary, key2] = val.$field.split '[].'
                //  $in: parents[val.$parent][ary]?.map((x) -> x[key2]) ? []
              const refVal = refs.parent[val.$parent][val.$field || '_id'];
              return doc[key] === refVal;
            } else {
              console.log('fixed diff', key, '-', doc[key], val);
              return doc[key] === val;
            }
          }
          console.log('filterFunc()', this, doc, refs);
          throw new Error('TODO: FilterBy');
        } : null,
      sort: this.SortBy && JSON.parse(this.SortBy),
      fields: this.Fields && JSON.parse(this.Fields),
      limit: this.LimitTo,
    });

    for (const childSpec of this.Children) {
      filter.addChild(rootPublication
        .getRecordFilter.call(childSpec, rootPublication));
    }

    return filter.build();
  },

});
