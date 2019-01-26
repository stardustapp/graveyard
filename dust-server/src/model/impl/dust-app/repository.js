class DustAppS3Repo {
  constructor() {
    this.bucket = new AWS.S3({
      region: 'us-west-2',
      params: {
        Bucket: 'stardust-repo',
      },
    });
  }
  async listPackages() {
    const {IsTruncated, Contents} = await this.bucket.
      makeUnauthenticatedRequest('listObjectsV2', {
        Delimiter: '/',
        Prefix: 'packages/',
      }).promise();

    if (IsTruncated) throw new Error(`truncated:
      More than like 500 packages seen`);

    return Contents
      .filter(({Key}) => Key
        .endsWith('.meta.json'))
      .map(obj => ({
        packageId: obj.Key.slice(9, -10),
        updatedAt: obj.LastModified,
      }));
  }
  async getPackageMeta(packageId) {
    const {Body} = await this.bucket
      .makeUnauthenticatedRequest('getObject', {
        Key: `packages/${packageId}.meta.json`,
      }).promise();
    return JSON.parse(Body);
  }
  async fetchPackage(packageId) {
    console.info('Fetching package contents for', packageId);
    const resp = await this.bucket.
      makeUnauthenticatedRequest('getObject', {
        Key: `packages/${packageId}.json`,
      }).promise();
    console.log()

    console.debug('Parsing package', resp);
    const pkg = JSON.parse(resp.Body);
    pkg._originalVersion = pkg._version;
    // insert upgrade code here
    if (pkg._version !== 3) throw new Error(`unsupported-version:
      This package is built for a newer or incompatible version of Stardust (${pkg._version})`);
    return pkg;
  }
}
