package main

import (
	"log"
	"os"
	"path"
	"strings"
	"sync/atomic"

	"github.com/stardustapp/core/base"
)

func cpRemoteToLocal(remote base.Context, srcPath string, destPath string) {
	entry, ok := remote.Get("/mnt/pub" + srcPath)
	if !ok {
		log.Println("Failed to locate source path:", srcPath)
		return
	}

	svc := &remoteToLocal{
		remote:     remote,
		destPrefix: strings.TrimSuffix(destPath, "/"),
	}
	if !svc.verifyDestReadiness() {
		return
	}
	svc.copyRecursive(0, "", entry)

	entries := atomic.LoadUint64(&svc.entryCount)
	log.Println("Copied", entries, "entries")
}

type remoteToLocal struct {
	remote     base.Context
	destPrefix string
	entryCount uint64
}

func (r *remoteToLocal) copyRecursive(depth int, prefix string, src base.Entry) {
	destPath := r.destPrefix
	if depth > 0 {
		destPath = path.Join(destPath, prefix)
	}

	switch entry := src.(type) {

	case base.Folder:
		err := os.Mkdir(destPath, 0775) // 0664
		if err != nil {
			log.Println("Couldn't create folder", destPath, "-", err)
			return
		}
		log.Println(prefix + "/")
		atomic.AddUint64(&r.entryCount, 1)

		for _, name := range entry.Children() {
			child, ok := entry.Fetch(name)
			if ok {
				r.copyRecursive(depth+1, strings.TrimPrefix(prefix+"/"+name, "/"), child)
			} else {
				log.Println("Couldn't get", name, "from", entry.Name())
			}
		}

	case base.String:
		destPath += ".string"
		file, err := os.Create(destPath)
		if err != nil {
			log.Println("Couldn't create file", destPath, "-", err)
			return
		}

		_, err = file.WriteString(entry.Get())
		if err != nil {
			log.Println("Couldn't write file", destPath, "-", err)
			return
		}

		err = file.Close()
		if err != nil {
			log.Println("Couldn't close file", destPath, "-", err)
			return
		}

		log.Println(prefix + ".string")
		atomic.AddUint64(&r.entryCount, 1)

	case base.File:
		file, err := os.Create(destPath)
		if err != nil {
			log.Println("Couldn't create file", destPath, "-", err)
			return
		}

		size := entry.GetSize()
		chunkSize := 1024
		var offset int64
		var written int64
		for offset < size {
			bytes := entry.Read(offset, chunkSize)
			n, err := file.Write(bytes)
			if err != nil {
				log.Println("Couldn't write to file", destPath, "-", err)
				return
			}
			written += int64(n)
			offset += int64(chunkSize)
		}

		if written != size {
			log.Println("WARN:", destPath, "- expected", size, "bytes, wrote", written)
		}

		err = file.Close()
		if err != nil {
			log.Println("Couldn't close file", destPath, "-", err)
			return
		}

		log.Println(prefix)
		atomic.AddUint64(&r.entryCount, 1)

	}
}

func (r *remoteToLocal) verifyDestReadiness() bool {
	_, err := os.Open(r.destPrefix)
	if !os.IsNotExist(err) {
		log.Println("Destination path", r.destPrefix, "already exists in the system")
		return false
	}

	parentPath := path.Dir(r.destPrefix)
	parent, err := os.Open(parentPath)
	if os.IsNotExist(err) {
		log.Println("Destination parent", parentPath, "doesn't exist", r.destPrefix)
		return false
	} else if err != nil {
		log.Println("Couldn't open destination parent", parentPath, "-", err)
		return false
	}
	parentStat, err := parent.Stat()
	if err != nil {
		log.Println("Couldn't stat destination parent", parentPath, "-", err)
		return false
	} else if !parentStat.IsDir() {
		log.Println("Destination parent", parentPath, "isn't a folder")
		return false
	}

	log.Println("Destination is ready")
	return true
}
