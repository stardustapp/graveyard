class LoaderCache {
  constructor(loaderFunc) {
    if (!loaderFunc || loaderFunc.prototype instanceof Function)
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

    const promise = this.loadOne(input).then(value => {
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

  async loadOne(id, input=null) {
    return this.loader(id, input);
  }

  async delete(id, input=null) {
    if (this.entities.has(id)) {
      const value = this.entities.get(id);
      if (value && value.stop) {
        await value.stop(input);
      }
      this.entities.delete(id);

    } else if (this.promises.has(id)) {
      const promise = this.promises.get(id);
      try {
        console.warn('purge-pending value', id, `hasn't loaded yet -- waiting`);

        const value = await promise;
        console.log('purge-pending value', id, 'loaded -- deleting it now');
        if (value && value.stop) {
          await value.stop(input);
        }
        this.entities.delete(id);

        console.log('purge-pending value', id, 'was cleanly deleted -- yay!');
      } catch (err) {
        console.log('purge-pending value', id, 'failed to start -- moving on');
      }

    } else {
      console.warn('not purging value', id, `- it wasn't started (??)`);
    }
  }
}