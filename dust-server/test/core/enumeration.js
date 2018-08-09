const assert = require('assert');
const {expect} = require('chai');

const {StringLiteral, FolderLiteral} = require('../../core/api-entries');
global.StringLiteral = StringLiteral;
global.FolderLiteral = FolderLiteral;
const {EnumerationWriter} = require('../../core/enumeration');

describe('EnumerationWriter', function() {
  it('should generally function', function() {
    const writer = new EnumerationWriter(1);
    writer.visit(new FolderLiteral(''));
    writer.descend('a');
    writer.visit(new StringLiteral('', '1'));
    writer.ascend();
    writer.descend('b');
    writer.visit(new StringLiteral('', '2'));
    writer.ascend();
    writer.descend('c');
    writer.visit(new StringLiteral('', '3'));
    writer.ascend();

    const output = writer.toOutput();
    expect(output).to.be.ok;
    expect(output.Type).to.be.equal('Folder');
    expect(output.Name).to.be.equal('enumeration');
    expect(output.Children.length).to.be.equal(4);
    expect(output.Children[0].Name).to.be.equal('');
    expect(output.Children[1].Name).to.be.equal('a');
  });

  it('should be nestable', function() {
    const writer = new EnumerationWriter(1);
    writer.visit(new FolderLiteral(''));
    writer.descend('a');
    writer.visit(new FolderLiteral(''));
    writer.descend('b');
    writer.visit(new FolderLiteral(''));
    writer.descend('c');
    writer.visit(new StringLiteral('', 'hello'));
    writer.ascend();
    writer.ascend();
    writer.ascend();

    const output = writer.toOutput();
    expect(output).to.be.ok;
    expect(output.Type).to.be.equal('Folder');
    expect(output.Name).to.be.equal('enumeration');
    expect(output.Children.length).to.be.equal(4);
    expect(output.Children[0].Name).to.be.equal('');
    expect(output.Children[1].Name).to.be.equal('a');
    expect(output.Children[2].Name).to.be.equal('a/b');
    expect(output.Children[3].Name).to.be.equal('a/b/c');
    expect(output.Children[3].StringValue).to.be.equal('hello');
  });

  it('should be transcludable at the root', function() {
    const writer2 = new EnumerationWriter(1);
    writer2.visit(new FolderLiteral(''));
    writer2.descend('a');
    writer2.visit(new FolderLiteral(''));
    writer2.descend('b');
    writer2.visit(new FolderLiteral(''));
    writer2.descend('c');
    writer2.visit(new StringLiteral('', 'hello'));
    writer2.ascend();
    writer2.ascend();
    writer2.ascend();

    const writer = new EnumerationWriter(1);
    writer.visitEnumeration(writer2.toOutput());

    const output = writer.toOutput();
    expect(output).to.be.ok;
    expect(output.Type).to.be.equal('Folder');
    expect(output.Name).to.be.equal('enumeration');
    expect(output.Children.length).to.be.equal(4);
    expect(output.Children[0].Name).to.be.equal('');
    expect(output.Children[1].Name).to.be.equal('a');
    expect(output.Children[2].Name).to.be.equal('a/b');
    expect(output.Children[3].Name).to.be.equal('a/b/c');
    expect(output.Children[3].StringValue).to.be.equal('hello');
  });

  it('should be transcludable while descended', function() {
    const writer2 = new EnumerationWriter(1);
    writer2.visit(new FolderLiteral(''));
    writer2.descend('a');
    writer2.visit(new FolderLiteral(''));
    writer2.descend('b');
    writer2.visit(new FolderLiteral(''));
    writer2.descend('c');
    writer2.visit(new StringLiteral('', 'hello'));
    writer2.ascend();
    writer2.ascend();
    writer2.ascend();

    const writer = new EnumerationWriter(1);
    writer.visit(new FolderLiteral(''));
    writer.descend('mnt');
    writer.visitEnumeration(writer2.toOutput());
    writer.ascend();

    const output = writer.toOutput();
    expect(output).to.be.ok;
    expect(output.Type).to.be.equal('Folder');
    expect(output.Name).to.be.equal('enumeration');
    expect(output.Children.length).to.be.equal(5);
    expect(output.Children[0].Name).to.be.equal('');
    expect(output.Children[1].Name).to.be.equal('mnt');
    expect(output.Children[2].Name).to.be.equal('mnt/a');
    expect(output.Children[3].Name).to.be.equal('mnt/a/b');
    expect(output.Children[4].Name).to.be.equal('mnt/a/b/c');
    expect(output.Children[4].StringValue).to.be.equal('hello');
  });

  it('should support reconstructing nested structures', function() {
    const writer = new EnumerationWriter(1);
    writer.visit(new FolderLiteral(''));
    writer.descend('a');
    writer.visit(new FolderLiteral(''));
    writer.descend('b');
    writer.visit(new FolderLiteral(''));
    writer.descend('c');
    writer.visit(new StringLiteral('', 'hello'));
    writer.ascend();
    writer.ascend();
    writer.descend('bbb');
    writer.visit(new StringLiteral('', 'hello'));
    writer.ascend();
    writer.ascend();

    const output = writer.reconstruct();
    expect(output).to.be.ok;
    expect(output.Type).to.be.equal('Folder');
    expect(output.Name).to.be.equal('');
  });
});
