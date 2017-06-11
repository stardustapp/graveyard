package main

import (
	"log"

	"github.com/stardustapp/core/client"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
)

type StarFile struct {
	name    string
	data    []byte
	orbiter *client.Orbiter

	nodefs.File
}

func NewStarFile(name string, data []byte, orbiter *client.Orbiter) *StarFile {
	return &StarFile{
		name:    name,
		data:    data,
		orbiter: orbiter,
		File:    nodefs.NewDefaultFile(),
	}
}

func (f *StarFile) GetAttr(out *fuse.Attr) fuse.Status {
	out.Mode = fuse.S_IFREG | 0644
	out.Size = uint64(len(f.data))
	return fuse.OK
}

func (f *StarFile) Read(buf []byte, off int64) (fuse.ReadResult, fuse.Status) {
	// TODO
	log.Println("Reading", len(buf), "bytes from", f, "at", off)

	end := int(off) + int(len(buf))
	if end > len(f.data) {
		end = len(f.data)
	}
	return fuse.ReadResultData(f.data[off:end]), fuse.OK
}

func (f *StarFile) Write(content []byte, offset int64) (uint32, fuse.Status) {
	// TODO
	log.Println("Writing", len(content), "bytes to", f, "at", offset)

	f.data = append(append(f.data[0:offset], content...), f.data[offset:]...)

	return uint32(len(content)), fuse.OK
}

// cleanup
func (f *StarFile) Release() {
	log.Printf("file: closed %s", f.name)

	err := f.orbiter.PutFile(f.name, f.data)
	if err != nil {
		log.Println(err)
	}
}
