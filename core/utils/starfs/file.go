package main

import (
	"log"

	"github.com/stardustapp/core/base"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
)

type StarFile struct {
	name    string
	entry base.File
	ctx base.Context
	isDirty bool

	nodefs.File
}

func NewStarFile(name string, entry base.File, ctx base.Context) *StarFile {
	return &StarFile{
		name:    name,
		entry: entry,
		ctx: ctx,
		File:    nodefs.NewDefaultFile(),
	}
}

func (f *StarFile) GetAttr(out *fuse.Attr) fuse.Status {
	out.Mode = fuse.S_IFREG | 0644
	out.Size = uint64(f.entry.GetSize())
	return fuse.OK
}

func (f *StarFile) Read(buf []byte, off int64) (fuse.ReadResult, fuse.Status) {
	log.Println("file: Reading", len(buf), "bytes from", f.name, "at", off)
	data := f.entry.Read(off, len(buf))
	return fuse.ReadResultData(data), fuse.OK
}

func (f *StarFile) Write(content []byte, offset int64) (uint32, fuse.Status) {
	log.Println("file: Writing", len(content), "bytes to", f, "at", offset)
	f.isDirty = true
	numBytes := f.entry.Write(offset, content)
	return uint32(numBytes), fuse.OK
}

// cleanup
func (f *StarFile) Release() {
	log.Printf("file: closed %s", f.name)

	if f.isDirty {
		ok := f.ctx.Put(f.name, f.entry)
		if !ok {
			log.Println("file: Couldn't write file", f.name, "on release")
		} else {
			log.Println("file: Implicitly saved", f.name, "on release")
		}
	}
}
