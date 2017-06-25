package main

import (
	"flag"
	"log"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/drivers"
	"github.com/stardustapp/core/inmem"
)

func main() {
	var starBase = flag.String("stardust-base", "ws://localhost:9234/~~export/ws", "Stardust Skynet API root")
	var src = flag.String("src", "sd://", "Location to copy from, local or Stardust")
	var dest = flag.String("dest", "", "Location to copy to, local or Stardust")
	flag.Parse()

	log.Println("Creating Stardust Orbiter...")
	root := inmem.NewFolder("/")
	ns := base.NewNamespace("starcp://", root)
	ctx := base.NewRootContext(ns)

	log.Println("Launching nsimport...")
	ctx.Put("/nsimport", drivers.GetNsimportDriver())
	importFunc, _ := ctx.GetFunction("/nsimport/invoke")
	remoteFs := importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
		inmem.NewString("endpoint-url", *starBase),
	))
	ctx.Put("/mnt", remoteFs)

	srcIsSd := strings.HasPrefix(*src, "sd:/")
	destIsSd := strings.HasPrefix(*dest, "sd:/")

	if !srcIsSd && !destIsSd {
		log.Println("Either src or dest must be stardust-rooted. Use the sd: prefix.")
		return
	}

	if srcIsSd && destIsSd {
		// TODO: implement remote-to-remote copies
		log.Println("Only one of src and dest can be stardust-rooted. Copy locally first, sorry")
		return
	}

	if srcIsSd {
		cpRemoteToLocal(ctx, strings.TrimPrefix(*src, "sd:"), *dest)
	}
}
