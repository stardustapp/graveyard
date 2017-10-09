package main

import (
	"flag"
	"fmt"
	"log"
)

func main() {
	//var skyLinkUri = flag.String("skylink-uri", "wss://devmode.cloud/~~export/ws", "Backing Skylink API root")
	//var statePath = flag.String("data-store", "/mnt/pub/n/redis-ns/data/skychart", "Location on Skylink upstream to persist data in")
	var masterBinary = flag.String("master-binary", "skychart", "Executable name that will be executed to serve as the system architect")
	var systemPort = flag.Int("system-port", 9235, "Localhost TCP port to expose the system API on")
	flag.Parse()

	if *masterBinary == "" {
		log.Fatalln("Master Executable path is required")
	}

	host := fmt.Sprint("localhost:", *systemPort)
	myUri := fmt.Sprint("skylink+ws://localhost:", *systemPort)
	LaunchSystem(*masterBinary, myUri, host)
}
