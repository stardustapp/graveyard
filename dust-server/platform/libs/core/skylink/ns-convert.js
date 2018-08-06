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
      return ent; // TODO: wrap with helpers to await as string

    default:
      throw new Error(`Received wire literal of unhandled type ${JSON.stringify(ent.Type)}`);

  }
}
