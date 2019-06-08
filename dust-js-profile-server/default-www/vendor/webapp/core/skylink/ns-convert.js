// recursive wire=>data
function entryToJS (ent) {
  if (ent == null) {
    return null;
  }
  switch (ent.Type) {

    case 'Folder':
      const obj = {};
      (ent.Children || []).forEach(child => {
        obj[child.Name] = entryToJS(child);
      });
      return obj;

    case 'String':
      return ent.StringValue;

    case 'Blob':
      // use native base64 when in nodejs
      if (typeof Buffer != 'undefined') {
        ent.Data = new Buffer(x.Data || '', 'base64').toString('utf8');
      } else {
        ent.Data = base64js.toByteArray(ent.Data);
        ent.asText = function() {
          return new TextDecoder('utf-8').decode(this.Data);
        }
      }
      return ent;

    default:
      throw new Error(`Received wire literal of unhandled type ${JSON.stringify(ent.Type)}`);

  }
}
