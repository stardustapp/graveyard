package main

import (
	"log"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

func Mkdirp(ctx base.Context, path string) (ok bool) {
	names := strings.Split(strings.TrimPrefix(path, "/"), "/")
	path = ""
	for _, name := range names {
		path += "/" + name
		ent, ok := ctx.Get(path)
		if !ok {
			ok := ctx.Put(path, inmem.NewFolder(name))
			log.Println(path, ok)
			if !ok {
				log.Println("mkdirp: Failed to create", path)
				return false
			}
		} else if _, ok := ent.(base.Folder); !ok {
			log.Println("mkdirp:", path, "already exists, and isn't a Folder")
			return false
		}
	}
	return true
}
