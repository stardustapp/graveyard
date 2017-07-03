package main

import (
	"flag"
	"log"
	"os/exec"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/toolbox"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
	"github.com/hanwen/go-fuse/fuse/pathfs"
)

func main() {
	var mountPoint = flag.String("mount-point", "/mnt/stardust", "Desired FUSE mount point")
	var skyLinkUri = flag.String("skylink-uri", "ws://localhost:9234/~~export/ws", "Backing Skylink API root")
	var skyLinkPath = flag.String("skylink-path", "/pub", "Location on Skylink upstream to present on the FS")
	flag.Parse()

	orbiter := toolbox.NewOrbiter("starfs://", *skyLinkUri)
	ctx := orbiter.GetContextFor("/mnt" + *skyLinkPath)

	// Try cleaning up past state
	// Fixes crash when nothing has the old mount open, but it's still there
	// Also handles creating the mountPoint
	exec.Command("fusermount", "-u", *mountPoint).Run()
	exec.Command("rm", "-rf", *mountPoint).Run()
	exec.Command("mkdir", *mountPoint).Run()

	server, err := Mount(*mountPoint, ctx)
	if err != nil {
		log.Fatalln("Mount fail:", err)
	}

	go handleShutdown(server)
	defer shutdownNow(server)
	log.Println("Mounted at", *mountPoint)

	log.Println("Serving mount")
	server.Serve()
	log.Println("Finished serving.")
}

func Mount(mountPoint string, ctx base.Context) (*fuse.Server, error) {
	starfs := &StarFs{
		FileSystem: pathfs.NewDefaultFileSystem(),
		ctx:        ctx,
	}
	nfs := pathfs.NewPathNodeFs(starfs, nil)

	conn := nodefs.NewFileSystemConnector(nfs.Root(), nil)
	return fuse.NewServer(conn.RawFS(), mountPoint, &fuse.MountOptions{
		MaxBackground: 12, // default
		FsName:        "starfs",
		Name:          "stardust",
	})
}
