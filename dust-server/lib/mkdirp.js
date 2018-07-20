async function mkdirp(device, path, justEnsure=false) {
  const entry = await device.getEntry(path);
  const literal = entry && await entry.get();
  if (literal) return false;

  if (justEnsure)
    throw new Error(`checked for folder at "${path}" but that path wasn't found`);

  const allParts = path.slice(1).split('/');
  const curParts = [];
  for (const part of allParts) {
    curParts.push(part);
    const curPath = '/'+curParts.join('/');

    const curEntry = await device.getEntry(curPath);
    const literal = curEntry && await curEntry.get();
    if (literal) continue; // exists!

    if (!curEntry || !curEntry.put)
      throw new Error('Failed to auto-create folder', curPath, `because it wasn't writable`);

    console.log('mkdirp creating folder', curPath);
    const ok = await curEntry.put(new FolderLiteral(decodeURIComponent(part)));
    if (!ok)
      throw new Error('Failed to auto-create folder', curPath, `- just didn't work`);
  }
  return true;
}