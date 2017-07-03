package main

import (
	"flag"
	"log"

	"github.com/stardustapp/core/toolbox"

	stargen "github.com/stardustapp/core/utils/stargen/common"
	"github.com/stardustapp/core/utils/stargen/platforms"
)

func main() {
	var skyLinkUri = flag.String("skylink-uri", "ws://localhost:9234/~~export/ws", "Backing Skylink API root")
	var driverPath = flag.String("driver-path", "", "Path within Stardust to driver source")
	var compilePath = flag.String("compile-path", "/tmp/stargen", "Path within Stardust for temporary source files")
	var targetPath = flag.String("target-path", "/tmp/stargen-out", "Path on host FS for build artifacts (and final binary or archive, called 'driver')")
	flag.Parse()

	if *driverPath == "" {
		log.Println("--driver-path is required. Feed me a native driver path!")
		return
	}

	log.Println("Loaded", platforms.CountPlatforms(), "platforms")

	orbiter := toolbox.NewOrbiter("stargen://", *skyLinkUri)
	gen := stargen.Stargen{
		Orbiter:     orbiter,
		DriverCtx:   orbiter.GetContextFor("/mnt/pub" + *driverPath),
		CompileCtx:  orbiter.GetContextFor("/mnt/pub" + *compilePath),
		CompilePath: *compilePath,
		TargetPath:  *targetPath,
	}
	log.Println("Compiling", *driverPath, "to", *targetPath, "via", *compilePath)

	gen.DiscoverPlatform()
	gen.Platform.GenerateDriver()
	gen.Platform.CompileDriver()
}
