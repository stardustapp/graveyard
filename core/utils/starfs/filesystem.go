package main

import (
	"log"
	"strings"
	"time"

	"github.com/stardustapp/core/client"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
	"github.com/hanwen/go-fuse/fuse/pathfs"
)

type StarFs struct {
	pathfs.FileSystem
	orbiter *client.Orbiter
}

func (me *StarFs) GetAttr(name string, context *fuse.Context) (*fuse.Attr, fuse.Status) {
	log.Printf("fs: get attributes on %s", name)

	if len(name) > 0 {
		name = "/" + name
	}
	err, ent := me.orbiter.LoadEntry(name)
	if err != nil {
		log.Println("get entry attrs failed", err)
		return nil, fuse.ENOENT
	}

	// TODO: there's gotta be a better way to get the size
	data, err := me.orbiter.ReadFile(name)
	if err != nil {
		log.Println("read file for size failed", name, err)
		return nil, fuse.ENOENT
	}

	var mode uint32 = fuse.S_IFREG | 0644
	if ent.Type == "Folder" {
		mode = fuse.S_IFDIR | 0755
	}

	return &fuse.Attr{
		Mode:  mode,
		Size:  uint64(len(data)),
		Mtime: uint64(time.Now().Unix()),
	}, fuse.OK
}

func (me *StarFs) OpenDir(name string, context *fuse.Context) (c []fuse.DirEntry, code fuse.Status) {
	log.Printf("fs: open directory %s", name)

	if len(name) > 0 {
		name = "/" + name
	}
	fi, err := me.orbiter.LoadFolder(name)
	if err != nil {
		log.Println("load folder failed", name, err)
		return nil, fuse.ENOENT
	}

	log.Println("got folder list", fi)
	entries := make([]fuse.DirEntry, len(fi.Children))
	for idx, child := range fi.Children {
		var mode uint32 = fuse.S_IFREG | 0644
		if child.Type == "Folder" {
			mode = fuse.S_IFDIR | 0755
		}

		entries[idx] = fuse.DirEntry{
			Name: child.Name,
			Mode: mode,
		}
	}
	return entries, fuse.OK
}

func (me *StarFs) Open(name string, flags uint32, context *fuse.Context) (file nodefs.File, code fuse.Status) {
	log.Printf("fs: open %s flags 0x%x", name, flags)

	if len(name) > 0 {
		name = "/" + name
	}
	data, err := me.orbiter.ReadFile(name)
	if err != nil {
		log.Println("read file failed", name, err)
		return nil, fuse.ENOENT
	}

	//if flags&uint32(os.O_RDONLY) != 0 {
	//	return nil, fuse.EPERM
	//}

	return NewStarFile(name, data, me.orbiter), fuse.OK
}

func (me *StarFs) Rename(oldName string, newName string, context *fuse.Context) (code fuse.Status) {
	log.Printf("fs: rename %s -> %s", oldName, newName)

	if len(oldName) > 0 {
		oldName = "/" + oldName
	}
	if len(newName) > 0 {
		newName = "/" + newName
	}

	err := me.orbiter.Rename(oldName, newName)
	if err != nil {
		return fuse.ENOENT
	} else {
		return fuse.OK
	}
}

func (me *StarFs) Create(name string, flags uint32, mode uint32, context *fuse.Context) (file nodefs.File, code fuse.Status) {
	log.Printf("fs: create %s flags 0x%x mode 0x%x", name, flags, mode)
	rawName := name

	if len(name) > 0 {
		name = "/" + name
	}
	err := me.orbiter.PutFile(name, make([]byte, 0))
	if err != nil {
		log.Println(err)
		return nil, fuse.ENOENT
	}

	return me.Open(rawName, flags, context)
}

func (me *StarFs) Mkdir(name string, mode uint32, context *fuse.Context) fuse.Status {
	log.Printf("fs: mkdir %s mode 0x%x", name, mode)

	if len(name) > 0 {
		name = "/" + name
	}
	err := me.orbiter.PutFolder(name)
	if err != nil {
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

	if len(name) > 0 {
		name = "/" + name
	}
	err := me.orbiter.Delete(name)
	if err != nil {
		return fuse.ENOENT
	} else {
		return fuse.OK
	}
}

func (me *StarFs) Unlink(name string, context *fuse.Context) (code fuse.Status) {
	log.Printf("fs: unlink %s", name)

	if len(name) > 0 {
		name = "/" + name
	}
	err := me.orbiter.Delete(name)
	if err != nil {
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
