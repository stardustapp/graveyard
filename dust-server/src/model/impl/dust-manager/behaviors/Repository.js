GraphEngine.attachBehavior('dust-manager/v1-beta1', 'Repository', {

    async listPackages() {
      const resp = await fetch(this.bucketOrigin + `/?prefix=${this.objectPrefix}&list-type=2`);
      if (resp.status !== 200) throw new Error(
        `Stardust Cloud Repo returned HTTP ${resp.status} when listing packages`);

      const rawText = await resp.text();
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(rawText, 'application/xml');

      const IsTruncated = doc.querySelector('IsTruncated');
      if (IsTruncated.textContent === 'true') throw new Error(`
        truncated: More than like 1000 package files seen`);

      return Array
        .from(doc.querySelectorAll('Contents'))
        .filter(el => el
          .querySelector('Key').textContent
          .endsWith('.meta.json'))
        .map(el => ({
          packageId: el.querySelector('Key').textContent.slice(9, -10),
          updatedAt: el.querySelector('LastModified').textContent,
          eTag: el.querySelector('ETag').textContent,
          size: parseInt(el.querySelector('Size').textContent),
        }));
    },

    async listPackageVersions(appId) {
      const resp = await fetch(this.bucketOrigin + `/?versions&prefix=${this.objectPrefix}${encodeURIComponent(appId)}.json`);
      if (resp.status !== 200) throw new Error(
        `Stardust Cloud Repo returned HTTP ${resp.status} when listing package versions for ${appId}`);

      const rawText = await resp.text();
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(rawText, 'application/xml');

      const IsTruncated = doc.querySelector('IsTruncated');
      if (IsTruncated.textContent === 'true') throw new Error(`
        truncated: More than like 1000 package versions seen`);

      return Array
        .from(doc.querySelectorAll('Version,DeleteMarker'))
        .map(el => ({
          type: el.nodeName,
          versionId: el.querySelector('Key').textContent.slice(9, -10),
          isLatest: el.querySelector('IsLatest').textContent === 'true',
          updatedAt: el.querySelector('LastModified').textContent,
          eTag: el.nodeName === 'Version' ? el.querySelector('ETag').textContent : null,
          size: el.nodeName === 'Version' ? parseInt(el.querySelector('Size').textContent) : null,
        }));
    },

    async downloadJsonFile(url) {
      const resp = await fetch(url);
      if (resp.status !== 200) throw new Error(
        `Stardust Cloud Repo returned HTTP ${resp.status} for ${url}`);
      const contentType = resp.headers.get('content-type');
      if (!contentType.startsWith('application/octet-stream') &&
          !contentType.startsWith('application/json')) throw new Error(
        `Stardust Cloud Repo returned Content-Type ${contentType} for ${url}`);

      let manifest;
      try {
        manifest = await resp.json();
      } catch (err) {
        if (err instanceof SyntaxError) throw new Error(
          `JSON syntax error in DUST manifest ${url}: ${err.message}`);
        throw err;
      }

      // also store version info
      return {
        manifest,
        headers: resp.headers,
      }
    },

    downloadMetadata(appId) {
      return this.downloadJsonFile(`${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appId)}.meta.json`);
    },

    downloadManifest(appId) {
      return this.downloadJsonFile(`${this.bucketOrigin}/${this.objectPrefix}${encodeURIComponent(appId)}.json`);
    },

});
