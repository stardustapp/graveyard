package main

import (
	"flag"
	"log"
	"os/exec"
	"time"

	"github.com/stardustapp/core/client"

	"github.com/hanwen/go-fuse/fuse"
	"github.com/hanwen/go-fuse/fuse/nodefs"
	"github.com/hanwen/go-fuse/fuse/pathfs"
)

func main() {
	var mountPoint = flag.String("mount-point", "/mnt/stardust", "Desired FUSE mount point")
	var starBase = flag.String("stardust-base", "http://localhost:9234/~~", "Stardust API path")
	flag.Parse()

	orbiter := client.NewOrbiter(*starBase)
	Run(*mountPoint, orbiter)
}

func Run(mountpoint string, orbiter *client.Orbiter) {
	// Try cleaning up past state
	// Fixes crash when nothing has the old mount open, but it's still there
	// Also handles creating the mountpoint
	exec.Command("fusermount", "-u", mountpoint).Run()
	exec.Command("rm", "-rf", mountpoint).Run()
	exec.Command("mkdir", mountpoint).Run()

	log.Println("Waiting a second...")
	time.Sleep(time.Second)

	server, err := Mount(mountpoint, orbiter)
	if err != nil {
		log.Fatalln("Mount fail:", err)
	}

	go handleShutdown(server)
	defer shutdownNow(server)
	log.Println("Mounted at", mountpoint)

	log.Println("Serving mount")
	server.Serve()
	log.Println("Finished serving.")
}

func Mount(mountpoint string, orbiter *client.Orbiter) (*fuse.Server, error) {
	starfs := &StarFs{
		FileSystem: pathfs.NewDefaultFileSystem(),
		orbiter:    orbiter,
	}
	nfs := pathfs.NewPathNodeFs(starfs, nil)

	conn := nodefs.NewFileSystemConnector(nfs.Root(), nil)
	return fuse.NewServer(conn.RawFS(), mountpoint, &fuse.MountOptions{
		MaxBackground: 12, // default
		FsName:        "starfs",
		Name:          "stardust",
	})
}
