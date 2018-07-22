const assert = require('assert');
const {expect} = require('chai');
const {Environment} = require('../../core/environment');

describe('Environment', function() {
  it('should generally work', async function() {
    const env = new Environment();
    await env.bind('/asdf', {getEntry: path => path});
    const output = await env.getEntry('/asdf/test');
    assert.equal(output, '/test');
  });

  it('should support basic #pathTo()', async function() {
    const env = new Environment();
    await env.bind('/asdf/zzz', {getEntry: path => path});
    const child = env.pathTo('/asdf');
    const output = await child.getEntry('/zzz/test');
    assert.equal(output, '/test');
  });

  it('should support overlapping', async function() {
    const env = new Environment();
    await env.bind('', {getEntry: path => [0,path]});
    await env.bind('/asdf', {getEntry: path => [1,path]});
    await env.bind('/asdf/zzz', {getEntry: path => [2,path]});
    await env.bind('/asdf/zzz/a', {getEntry: path => [3,path]});
    await env.bind('/asdf/zzz/a/b', {getEntry: path => [4,path]});

    const child = env.pathTo('/asdf/zzz/a');
    const output = await child.getEntry('/b/test/t/t');
    expect(output[0]).to.equal(4);
    expect(output[1]).to.equal('/test/t/t');
  });

  it('should allow root-pathing after pathTo', async function() {
    const env = new Environment();
    await env.bind('/asdf/33', {getEntry: path => path});
    const child = env.pathTo('/asdf/33');

    const output = await child.getEntry('');
    expect(output).to.equal('');
  });

  it('should allow escaping root-pathing after pathTo', async function() {
    const env = new Environment();
    await env.bind('/asdf/33', {getEntry: path => path});
    const child = env.pathTo('/asdf/33/4');

    const output = await child.getEntry('');
    expect(output).to.equal('/4');
  });

  it(`shouldn't leak child binds to parents`, async function() {
    const env = new Environment();
    const child = env.pathTo('/asdf');
    await child.bind('/zzz', {getEntry: path => path});

    const parentOut = await env.getEntry('/asdf/zzz');
    expect(parentOut).to.be.undefined;
    const childOut = await child.getEntry('/zzz');
    expect(childOut).to.equal('');
  });
});
