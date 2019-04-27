class LoaderCache {
  constructor(loadFunc, keyFunc) {
    if (!loadFunc || typeof loadFunc !== 'function')
      throw new Error(`LoaderCache requires a backing load Function`);
    this.loadFunc = loadFunc;
    this.keyFunc = keyFunc || (input => input);
    // TODO? cache for keyFunc

    this.entities = new Map;
    this.promises = new Map;
  }

  // returns value only if it's already loaded
  peek(input) {
    const key = this.keyFunc(input);
    return this.entities.get(key);
  }

  // returns existing value or promise, or loads the node afresh
  get(input) {
    const key = this.keyFunc(input);
    if (this.entities.has(key))
      return this.entities.get(key);
    if (this.promises.has(key))
      return this.promises.get(key);

    const promise = this.load(key, input);
    this.set(key, promise);
    return promise;
  }

  // bring a new value into the cache
  async load(key, input) {
    try {
      const value = await this.loadFunc(input, key);
      // TODO: check if we're still relevant before writing
      this.set(key, value);
      return value;
    } catch (err) {
      // TODO: check if we're still relevant before deleting
      this.promises.delete(key);
      //console.error(`LoaderCache failed to load value`, key, input, err);
      return Promise.reject(err);
    }
  }

  // (sync) iterate what's immediately available
  loadedEntities() {
    return this.entities.values();
  }
  // wait for pending loads to finish, then iterate everything
  async allEntities() {
    await Promise.all(this.promises.values());
    return this.entities.values();
  }

  // replace a key with specific value or promise
  set(key, value) {
    if (typeof key !== 'string')
      key = this.keyFunc(key);

    this.promises.delete(key);
    this.entities.delete(key);

    if (value != null && typeof value.then === 'function')
      this.promises.set(key, value);
    else
      this.entities.set(key, value);
  }

  clearAll() {
    this.entities.clear();
    this.promises.clear();
  }
/*
  async delete(id, input=null) {
    if (this.entities.has(id)) {
      const value = this.entities.get(id);
      if (value && value.stop) {
        await value.stop(input);
      }
      this.entities.delete(id);

    } else if (this.promises.has(id)) {
      try {
        console.warn('purge-pending value', id, 'is still starting, waiting...');
        await this.promises.get(id);
        return this.delete(id, input);
      } catch (err) {
        console.warn('purge-pending value', id, 'failed to start -- moving on');
      }

    } else {
      console.warn('not purging value', id, `- it wasn't started (??)`);
    }
  }
*/
}

if (typeof module !== 'undefined') {
  module.exports = {
    LoaderCache,
  };
}
