package main

import (
	"log"
	"strings"
	"time"
	"path"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
	"github.com/hanwen/go-fuse/fuse/pathfs"
)

type StarFs struct {
	pathfs.FileSystem
	ctx base.Context
}

func (me *StarFs) GetAttr(name string, context *fuse.Context) (*fuse.Attr, fuse.Status) {
	log.Printf("fs: get attributes on %s", name)

	name = "/" + name
	ent, ok := me.ctx.Get(name)
	if !ok {
		log.Println("fs: get entry failed on", name)
		return nil, fuse.ENOENT
	}

	attrs := &fuse.Attr{
		Mode:  fuse.S_IFREG | 0644,
		Size:  0,
		Mtime: uint64(time.Now().Unix()),
	}

	if _, isFolder := ent.(base.Folder); isFolder {
		attrs.Mode = fuse.S_IFDIR | 0755
	}
	if file, isFile := ent.(base.File); isFile {
		attrs.Size = uint64(file.GetSize())
	}

	return attrs, fuse.OK
}

func (me *StarFs) OpenDir(name string, context *fuse.Context) (c []fuse.DirEntry, code fuse.Status) {
	log.Printf("fs: open directory %s", name)

	name = "/" + name
	fi, ok := me.ctx.GetFolder(name)
	if !ok {
		log.Println("get folder failed", name)
		return nil, fuse.ENOENT
	}

	log.Println("got folder list", fi)
	entries := make([]fuse.DirEntry, len(fi.Children()))
	for idx, child := range fi.Children() {

		// TODO: use enumeration subsystem
		_, isFolder := me.ctx.GetFolder(name + "/" + child)

		var mode uint32 = fuse.S_IFREG | 0644
		if isFolder {
			mode = fuse.S_IFDIR | 0755
		}

		entries[idx] = fuse.DirEntry{
			Name: child,
			Mode: mode,
		}
	}
	return entries, fuse.OK
}

func (me *StarFs) Open(name string, flags uint32, context *fuse.Context) (file nodefs.File, code fuse.Status) {
	log.Printf("fs: open %s flags 0x%x", name, flags)

	name = "/" + name
	fEnt, ok := me.ctx.GetFile(name)
	if !ok {
		log.Println("read file failed", name)
		return nil, fuse.ENOENT
	}

	//if flags&uint32(os.O_RDONLY) != 0 {
	//	return nil, fuse.EPERM
	//}

	return NewStarFile(name, fEnt, me.ctx), fuse.OK
}

func (me *StarFs) Rename(oldName string, newName string, context *fuse.Context) (code fuse.Status) {
	log.Printf("fs: rename %s -> %s", oldName, newName)

	if len(oldName) > 0 {
		oldName = "/" + oldName
	}
	if len(newName) > 0 {
		newName = "/" + newName
	}

	if ok := me.ctx.Copy(oldName, newName); !ok {
		log.Println("fs: Failed to copy", oldName, "to", newName)
		return fuse.ENOENT
	}
	if ok := me.ctx.Put(oldName, nil); !ok {
		log.Println("fs: Failed to clean up", oldName, "after rename op")
		return fuse.ENOENT
	}
	return fuse.OK
}

func (me *StarFs) Create(name string, flags uint32, mode uint32, context *fuse.Context) (file nodefs.File, code fuse.Status) {
	log.Printf("fs: create %s flags 0x%x mode 0x%x", name, flags, mode)
	rawName := name

	name = "/" + name
	ok := me.ctx.Put(name, inmem.NewFile(path.Base(name), make([]byte, 0)))
	if !ok {
		log.Println("fs: Couldn't create empty file", name)
		return nil, fuse.ENOENT
	}

	return me.Open(rawName, flags, context)
}

func (me *StarFs) Mkdir(name string, mode uint32, context *fuse.Context) fuse.Status {
	log.Printf("fs: mkdir %s mode 0x%x", name, mode)

	name = "/" + name
	ok := me.ctx.Put(name, inmem.NewFolder(path.Base(name)))
	if !ok {
		return fuse.ENOENT
	} else {
		return fuse.OK
	}
}

func (me *StarFs) Rmdir(name string, context *fuse.Context) (code fuse.Status) {
	log.Printf("fs: rmdir %s", name)

	if strings.HasSuffix(name, ".staging") {
		// TODO: ignoring these for npm
		return fuse.OK
	}

	name = "/" + name
	ok := me.ctx.Put(name, nil)
	if !ok {
		return fuse.ENOENT
	} else {
		return fuse.OK
	}
}

func (me *StarFs) Unlink(name string, context *fuse.Context) (code fuse.Status) {
	log.Printf("fs: unlink %s", name)

	name = "/" + name
	ok := me.ctx.Put(name, nil)
	if !ok {
		return fuse.ENOENT
	} else {
		return fuse.OK
	}
}

func (me *StarFs) Utimens(name string, Atime *time.Time, Mtime *time.Time, context *fuse.Context) (code fuse.Status) {
	log.Println("fs: utime", name, Atime, Mtime)
	// TODO
	return fuse.OK
}
