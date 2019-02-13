class DDPSubscription {
  constructor(ddp, {id, name, params}) {
    this.ddp = ddp;
    this.subId = id;
    this.subName = name;
    this.params = params;

    this.isReady = false;
    this.collections = {};
    this.ddp.subscriptions
      .set(this.subId, this);
  }

  getCollection(name) {
    if (!(name in this.collections))
      this.collections[name] = this.ddp.getCollection(name);
    return this.collections[name];
  }

  ready() {
    if (this.isReady) throw new Error(
      `BUG: Can't call DDPSubscription#ready() as the sub was already ready`);
    this.isReady = true;

    this.ddp.queueResponses({
      msg: 'ready',
      subs: [this.subId],
    });
  }

  stop(andRetract=true) {
    if (andRetract) {
      Object.keys(this.collections).forEach(
        name => this.collections[name].purgePresenter(this));
    }

    this.ddp.subscriptions.delete(this.subId);
  }
}

// Every document that this class currently holds will be synced to the client.
// Don't give it documents that the client doesn't need to know about.
// You can using multiple presenters to present the same documents twice.
// Each doc-presenter _may_ provide a field mask (like mongoDB 'fields') which filters what is sent.
// Otherwise, if this class holds the document, the client holds the full document too.
class DDPSessionCollection {
  constructor(ddp, collName) {
    this.ddp = ddp;
    this.collName = collName;

    this.documents = new Map;
  }

  convertFieldsForWire(obj) {
    const fields = {};
    for (const key of Object.keys(this.fields)) {
      let val = this.fields[key];
      if (val && val.constructor === Date)
        val = {$date: +val};
      if (val && val.constructor === Object)
        val = this.convertFieldsForWire(val);
      fields[key] = val;
    }
    return fields;
  }

  presentFields(id, presenter, fields, opts={}) {
    if (this.documents.has(id)) {
      const doc = this.documents.get(id);
      doc.addPresenter(presenter, opts);

      const differs = false;
      for (const key of Object.keys(fields)) {
        if (doc.fields[key] === fields[key])
          continue;
        console.log('field', key, 'was', doc.fields[key], 'is now', fields[key]);
        differs = true;
      }
      if (differs) throw new Error(
        `doc multi-present TODO (different field values!)`);

    } else {
      const doc = new DDPSessionDocument(fields);
      doc.addPresenter(presenter, opts);

      this.documents.set(id, doc);
      this.ddp.queueResponses({
        msg: 'added',
        collection: this.collName,
        id: id,
        fields: this.convertFieldsForWire(doc.visibleFields()),
      });
    }
  }

  // returns true if the document is now removed
  retractFields(id, presenter) {
    if (!this.documents.has(id)) throw new Error(
      `Presenter cannot restract document ${JSON.stringify(id)} as no one has presented it`);

    const doc = this.documents.get(id);
    doc.removePresenter(presenter);

    // clean out the document if it's gone now
    if (doc.isAbandoned) {
      this.ddp.queueResponses({
        msg: 'removed',
        collection: this.collName,
        id: id,
      });
      this.documents.delete(id);
      return true;
    }

    if (doc.fieldMask) throw new Error(
      `TODO: retracted presenter on masked document, needs recalc`);
    return false;
  }

  purgePresenter(presenter) {
    console.log('purging presenter', presenter);
    let cleaned = 0;
    let retracted = 0;
    for (const [id, doc] of this.documents) {
      if (!doc.presenters.has(presenter))
        continue;

      cleaned++;
      if (this.retractFields(id, presenter))
        retracted++;
    }
    console.log('cleaned', cleaned, 'docs from presenter, retracting', retracted);
  }
}

class DDPSessionDocument {
  constructor(fields) {
    this.fields = fields;

    this.presenters = new Map;
    this.fieldMask = false;
  }

  addPresenter(presenter, opts) {
    if (opts.fieldMask) throw new Error(
      `TODO: fieldMask setup`);
    if (this.presenters.has(presenter)) throw new Error(
      `The given presenter already presented a copy of record ${id}`);
    this.presenters.set(presenter, opts);
  }

  removePresenter(presenter) {
    if (!this.presenters.has(presenter)) throw new Error(
      `Presenter cannot retract document which it was not already presenting`);
    this.presenters.delete(presenter);
  }

  get isAbandoned() {
    return this.presenters.size === 0;
  }

  visibleFields() {
    if (this.fieldMask) throw new Error(
      `TODO: fieldMask usage`);
    return this.fields;
  }
}
