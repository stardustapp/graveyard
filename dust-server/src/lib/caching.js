class LoaderCache {
  constructor(loaderFunc) {
    if (!loaderFunc || typeof loaderFunc !== 'function')
      throw new Error(`LoaderCache requires a loader Function`);
    this.loader = loaderFunc;

    this.entities = new Map;
    this.promises = new Map;
  }

  async getOne(id, input=null) {
    if (this.entities.has(id))
      return this.entities.get(id);
    if (this.promises.has(id))
      return this.promises.get(id);

    const realInput = input === null ? id : input;
    const promise = Promise.resolve(this.loader(realInput)).then(value => {
      this.promises.delete(id);
      this.entities.set(id, value);
      console.debug(`Successfully loaded value`, id, 'as', value);
      return value;
    }, err => {
      this.promises.delete(id);
      // TODO: send to bugsnag
      console.error(`Failed to load value`, id, err);
      return Promise.reject(err);
    });

    this.promises.set(id, promise);
    return promise;
  }

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
}

if (typeof module !== 'undefined') {
  module.exports = {
    LoaderCache,
  };
}
