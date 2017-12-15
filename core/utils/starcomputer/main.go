package main

import (
	"flag"
	"log"
	"time"

	//"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/toolbox"
	"github.com/stardustapp/core/computer"
)

func main() {
	//var skyLinkUri = flag.String("skylink-uri", "wss://devmode.cloud/~~export/ws", "Backing Skylink API root")
	//var statePath = flag.String("data-store", "/mnt/pub/n/redis-ns/data/skychart", "Location on Skylink upstream to persist data in")
	//var masterBinary = flag.String("master-binary", "skychart", "Executable name that will be executed to serve as the system architect")
	//var systemPort = flag.Int("system-port", 9235, "Localhost TCP port to expose the system API on")
	var systemUri = flag.String("system-uri", "", "starsystem skylink:// URI")
	flag.Parse()

	if *systemUri == "" {
		panic("Skylink URI for starsystem is required")
	}

	orbiter := toolbox.NewOrbiter("starcomputer://")
	if err := orbiter.MountURI(*systemUri, "/mnt/starsystem"); err != nil {
		log.Println(err)
		log.Fatalln("Failed to mount starsystem from", *systemUri)
	}

	ctx := orbiter.GetContextFor("/mnt/starsystem")
	root, _ := ctx.GetFolder("/")
	log.Println(root.Children())

	computer.Run()

/*
	ctx.Put("/processes/starfs", inmem.NewFolderOf("starfs",
		inmem.NewString("command", "starfs"),
		inmem.NewFolderOf("arguments",
			inmem.NewString("1", "--skylink-uri"),
			inmem.NewString("2", "https://stardust.apt.danopia.net/~~export"),
			inmem.NewString("3", "--skylink-path"),
			inmem.NewString("4", "/"),
			inmem.NewString("5", "--mount-point"),
			inmem.NewString("6", "/mnt/stardust"),
		),
	))
*/

	// TODO: sleep better
	// probably want to host a skylink endpoint anyway?
	//log.Println("Entering idle loop")
	//for {
		time.Sleep(time.Millisecond)
	//}
}
